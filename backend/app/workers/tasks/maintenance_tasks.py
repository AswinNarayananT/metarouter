import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, or_
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.core.redis_client import redis_client
from app.realtime.notify import notify_attachment_updated
from app.models.conversation_model import ChatMessage, MessageStatus
from app.models.broadcast_model import Broadcast, BroadcastRecipient
from app.models.whatsapp_model import WhatsAppNumber
from app.services.whatsapp_service import get_phone_number_status, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError
from app.services.channel_service import mark_number_disconnected
from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task, pause_number_broadcasts, retry_marker_key
from app.workers.tasks.broadcast_tasks import process_broadcast_task
from app.models.knowledge_model import KnowledgeDocument
from app.workers.tasks.knowledge_tasks import process_knowledge_document_task, knowledge_retry_marker_key
from app.models.attachment_model import ChatAttachment
from app.workers.tasks.media_tasks import download_whatsapp_media_task, parse_document_task, media_retry_marker_key

STUCK_MESSAGES_PER_SWEEP = 500


@celery_app.task(name="refresh_whatsapp_numbers_task")
def refresh_whatsapp_numbers_task():
    db = SessionLocal()
    try:
        # Disconnected numbers are skipped until they are reconnected
        numbers = db.query(WhatsAppNumber).filter(WhatsAppNumber.status == "connected").all()
        updated = 0

        for number in numbers:
            # 1. Ask Meta for the current quality and tier (one failing number doesn't stop the rest)
            try:
                status = get_phone_number_status(number.phone_number_id, number.access_token)
            except WhatsAppTokenError as exc:
                mark_number_disconnected(db, number, exc)
                continue
            except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
                print(f"[NUMBER REFRESH] {number.display_phone_number}: {exc}")
                continue

            was_red = number.quality_rating == "RED"
            if status["quality_rating"] in ("GREEN", "YELLOW", "RED"):
                number.quality_rating = status["quality_rating"]
            if status["messaging_limit_tier"] and status["messaging_limit_tier"].startswith("TIER_"):
                number.messaging_tier = status["messaging_limit_tier"]

            # 2. Newly flagged: pause its broadcasts like the FLAGGED webhook (Resume stays manual)
            if number.quality_rating == "RED" and not was_red:
                paused = pause_number_broadcasts(db, number)
                print(f"[NUMBER REFRESH] {number.display_phone_number}: quality RED, paused {paused} broadcasts")

            db.commit()
            updated += 1

        print(f"[NUMBER REFRESH] refreshed {updated} of {len(numbers)} numbers")

    finally:
        db.close()


@celery_app.task(name="sweep_stuck_messages_task")
def sweep_stuck_messages_task():
    db = SessionLocal()
    try:
        # 1. Outgoing messages still pending well after they were queued
        stuck_before = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=settings.STUCK_MESSAGE_MINUTES)
        rows = db.query(ChatMessage.id).filter(
            ChatMessage.status == MessageStatus.PENDING,
            ChatMessage.created_at < stuck_before
        ).order_by(ChatMessage.id).limit(STUCK_MESSAGES_PER_SWEEP).all()
        message_ids = [r.id for r in rows]

        # 2. Leave messages held back on purpose by a quality- or disconnect-paused broadcast
        held = set()
        if message_ids:
            held_rows = db.query(BroadcastRecipient.chat_message_id).join(Broadcast, Broadcast.id == BroadcastRecipient.broadcast_id).filter(
                BroadcastRecipient.chat_message_id.in_(message_ids),
                Broadcast.status == "paused",
                Broadcast.pause_reason.in_(["quality_low", "number_disconnected"])
            ).all()
            held = {r.chat_message_id for r in held_rows}

        # 3. ... and messages that already have a retry scheduled
        requeued = 0
        for message_id in message_ids:
            if message_id in held or redis_client.exists(retry_marker_key(message_id)):
                continue
            # Spread the re-sends; the send task's lock and pending check stop double sends
            send_whatsapp_message_task.apply_async(args=[message_id], countdown=requeued // settings.BROADCAST_MESSAGES_PER_SECOND)
            requeued += 1

        if requeued:
            print(f"[SWEEP] re-queued {requeued} stuck messages")

        # 4. Knowledge PDFs still processing well after upload / retry (e.g. the worker restarted)
        stuck_documents = db.query(KnowledgeDocument.id).filter(
            KnowledgeDocument.status == "processing",
            KnowledgeDocument.processing_started_at < datetime.now(timezone.utc) - timedelta(minutes=settings.STUCK_MESSAGE_MINUTES)
        ).all()
        for row in stuck_documents:
            if redis_client.exists(knowledge_retry_marker_key(row.id)):
                continue
            # The task's lock and status check stop a document being processed twice
            process_knowledge_document_task.delay(row.id)
            print(f"[SWEEP] re-queued stuck knowledge document {row.id}")

        # 5. Customer media still downloading / parsing well after it arrived (e.g. the worker restarted)
        now = datetime.now(timezone.utc)
        attachments = db.query(ChatAttachment).filter(
            ChatAttachment.created_at < now - timedelta(minutes=settings.STUCK_MESSAGE_MINUTES),
            or_(ChatAttachment.download_status == "pending", (ChatAttachment.download_status == "done") & (ChatAttachment.parse_status == "pending"))
        ).order_by(ChatAttachment.id).limit(STUCK_MESSAGES_PER_SWEEP).all()

        too_old_before = now - timedelta(hours=settings.STUCK_MEDIA_MAX_AGE_HOURS)
        for attachment in attachments:
            # Too old to answer the customer about: give up quietly (no AI reply days later)
            if attachment.created_at < too_old_before:
                if attachment.download_status == "pending":
                    attachment.download_status = "failed"
                    attachment.parse_status = "skipped"
                else:
                    attachment.parse_status = "failed"
                attachment.error = "Processing didn't finish in time"
                db.commit()
                notify_attachment_updated(attachment)
                print(f"[SWEEP] gave up on stuck attachment {attachment.id}")
                continue

            # A retry is already scheduled for it
            if redis_client.exists(media_retry_marker_key(attachment.id)):
                continue

            # The tasks' locks and status checks stop a file being handled twice
            if attachment.download_status == "pending":
                download_whatsapp_media_task.delay(attachment.id)
            else:
                parse_document_task.delay(attachment.id)
            print(f"[SWEEP] re-queued stuck attachment {attachment.id} ({'download' if attachment.download_status == 'pending' else 'parse'})")

    finally:
        db.close()


@celery_app.task(name="resume_due_broadcasts_task")
def resume_due_broadcasts_task():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # 1. Tier pauses whose 24-hour window has freed up
        due = db.query(Broadcast).filter(
            Broadcast.status == "paused",
            Broadcast.pause_reason == "tier_limit",
            Broadcast.resume_at <= now
        ).all()

        # 2. Sending broadcasts that stopped making progress (their next batch job was lost)
        stalled_before = now.replace(tzinfo=None) - timedelta(minutes=settings.STALLED_BROADCAST_MINUTES)
        sending = db.query(Broadcast).filter(Broadcast.status.in_(["queued", "sending"])).all()
        stalled = []
        completed = 0
        for broadcast in sending:
            has_unreleased = db.query(BroadcastRecipient.id).filter(
                BroadcastRecipient.broadcast_id == broadcast.id,
                BroadcastRecipient.status == "pending"
            ).first()
            if not has_unreleased:
                # Everyone released and every message sent / failed: mark it completed so it leaves this check for good
                has_unsent = db.query(ChatMessage.id).join(BroadcastRecipient, BroadcastRecipient.chat_message_id == ChatMessage.id).filter(
                    BroadcastRecipient.broadcast_id == broadcast.id,
                    ChatMessage.status == MessageStatus.PENDING
                ).first()
                if not has_unsent:
                    broadcast.status = "completed"
                    broadcast.dispatch_token = None
                    db.commit()
                    completed += 1
                continue

            last_message_at = db.query(func.max(ChatMessage.created_at)).join(BroadcastRecipient, BroadcastRecipient.chat_message_id == ChatMessage.id).filter(
                BroadcastRecipient.broadcast_id == broadcast.id
            ).scalar()
            # Message times are stored as UTC without a timezone; broadcast times with one
            started_at = broadcast.created_at.astimezone(timezone.utc).replace(tzinfo=None) if broadcast.created_at else None
            last_progress = last_message_at or started_at
            if last_progress and last_progress < stalled_before:
                stalled.append(broadcast)

        if completed:
            print(f"[BROADCAST] marked {completed} finished broadcasts completed")

        # 3. Restart each with a new token so any older scheduled run stops
        for broadcast in due + stalled:
            broadcast.dispatch_token = uuid.uuid4().hex
            db.commit()
            process_broadcast_task.delay(broadcast_id=broadcast.id, dispatch_token=broadcast.dispatch_token)
            print(f"[BROADCAST] {broadcast.id}: restarted ({'tier window freed' if broadcast in due else 'stalled'})")

    finally:
        db.close()
