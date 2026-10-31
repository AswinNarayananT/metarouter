import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, or_
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.core.redis_client import redis_client
from app.realtime.notify import notify_attachment_updated
from app.models.conversation_model import ChatMessage, MessageStatus, Conversation, ConversationStatus
from app.models.broadcast_model import Broadcast, BroadcastRecipient
from app.models.whatsapp_model import WhatsAppNumber
from app.models.organization_model import Organization
from app.services.whatsapp_service import get_phone_number_status, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError
from app.services.channel_service import mark_number_disconnected
from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task, pause_number_broadcasts, retry_marker_key
from app.workers.tasks.broadcast_tasks import process_broadcast_task
from app.models.knowledge_model import KnowledgeDocument
from app.workers.tasks.knowledge_tasks import process_knowledge_document_task, knowledge_retry_marker_key
from app.models.attachment_model import ChatAttachment
from app.workers.tasks.media_tasks import download_whatsapp_media_task, parse_document_task, media_retry_marker_key
from app.models.ticket_model import Ticket, TicketActivity
from app.services.ticket_service import close_ticket, release_chat_after_close
from app.models.ai_settings_model import OrganizationAISettings
from app.models.notification_model import Notification
from app.services.notification_service import notify_unassigned_reminder
from app.core.features import is_feature_enabled

REMINDER_KEY_EXPIRE_SECONDS = 2 * 24 * 3600  # Long after the last reminder could be due

STUCK_MESSAGES_PER_SWEEP = 500
IDLE_TICKETS_PER_SWEEP = 50  # Each close makes one AI labelling call


@celery_app.task(name="refresh_whatsapp_numbers_task")
def refresh_whatsapp_numbers_task():
    db = SessionLocal()
    try:
        # Disconnected numbers and suspended workspaces are skipped
        numbers = (
            db.query(WhatsAppNumber)
            .join(Organization, WhatsAppNumber.organization_id == Organization.id)
            .filter(
                WhatsAppNumber.status == "connected",
                Organization.subscription_status == "active"
            )
            .all()
        )
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
        # 1. Outgoing messages still pending well after they were queued (skip suspended workspaces)
        stuck_before = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=settings.STUCK_MESSAGE_MINUTES)
        rows = (
            db.query(ChatMessage.id)
            .join(Conversation, ChatMessage.conversation_id == Conversation.id)
            .join(Organization, Conversation.organization_id == Organization.id)
            .filter(
                ChatMessage.status == MessageStatus.PENDING,
                ChatMessage.created_at < stuck_before,
                Organization.subscription_status == "active"
            )
            .order_by(ChatMessage.id)
            .limit(STUCK_MESSAGES_PER_SWEEP)
            .all()
        )
        message_ids = [r.id for r in rows]

        # 2. Leave messages held back on purpose by a quality-, disconnect-, or suspended-paused broadcast
        held = set()
        if message_ids:
            held_rows = db.query(BroadcastRecipient.chat_message_id).join(Broadcast, Broadcast.id == BroadcastRecipient.broadcast_id).filter(
                BroadcastRecipient.chat_message_id.in_(message_ids),
                Broadcast.status == "paused",
                Broadcast.pause_reason.in_(["quality_low", "number_disconnected", "workspace_inactive", "workspace_suspended"])
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

        # 4. Knowledge PDFs still processing well after upload / retry (skip suspended workspaces)
        stuck_documents = (
            db.query(KnowledgeDocument.id)
            .join(Organization, KnowledgeDocument.organization_id == Organization.id)
            .filter(
                KnowledgeDocument.status == "processing",
                KnowledgeDocument.processing_started_at < datetime.now(timezone.utc) - timedelta(minutes=settings.STUCK_MESSAGE_MINUTES),
                Organization.subscription_status == "active"
            )
            .all()
        )
        for row in stuck_documents:
            if redis_client.exists(knowledge_retry_marker_key(row.id)):
                continue
            # The task's lock and status check stop a document being processed twice
            process_knowledge_document_task.delay(row.id)
            print(f"[SWEEP] re-queued stuck knowledge document {row.id}")

        # 5. Customer media still downloading / parsing well after it arrived (skip suspended workspaces)
        now = datetime.now(timezone.utc)
        attachments = (
            db.query(ChatAttachment)
            .join(Organization, ChatAttachment.organization_id == Organization.id)
            .filter(
                ChatAttachment.created_at < now - timedelta(minutes=settings.STUCK_MESSAGE_MINUTES),
                or_(ChatAttachment.download_status == "pending", (ChatAttachment.download_status == "done") & (ChatAttachment.parse_status == "pending")),
                Organization.subscription_status == "active"
            )
            .order_by(ChatAttachment.id)
            .limit(STUCK_MESSAGES_PER_SWEEP)
            .all()
        )

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

        # 1. Tier pauses whose 24-hour window has freed up (skip suspended workspaces)
        due = (
            db.query(Broadcast)
            .join(Organization, Broadcast.organization_id == Organization.id)
            .filter(
                Broadcast.status == "paused",
                Broadcast.pause_reason == "tier_limit",
                Broadcast.resume_at <= now,
                Organization.subscription_status == "active"
            )
            .all()
        )

        # 2. Sending broadcasts that stopped making progress (skip suspended workspaces)
        stalled_before = now.replace(tzinfo=None) - timedelta(minutes=settings.STALLED_BROADCAST_MINUTES)
        sending = (
            db.query(Broadcast)
            .join(Organization, Broadcast.organization_id == Organization.id)
            .filter(
                Broadcast.status.in_(["queued", "sending"]),
                Organization.subscription_status == "active"
            )
            .all()
        )
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


@celery_app.task(name="close_idle_tickets_task")
def close_idle_tickets_task():
    db = SessionLocal()
    try:
        # 1. Tickets the AI is handling whose chat has had no message for a while (skip suspended workspaces)
        #    Team tickets (open / in progress / waiting) are never closed automatically
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=settings.TICKET_IDLE_CLOSE_HOURS)
        last_activity = db.query(ChatMessage.conversation_id, func.max(ChatMessage.created_at).label("last_at")).filter(
            ChatMessage.sender != "system"
        ).group_by(ChatMessage.conversation_id).subquery()

        tickets = (
            db.query(Ticket)
            .join(last_activity, last_activity.c.conversation_id == Ticket.conversation_id)
            .join(Organization, Ticket.organization_id == Organization.id)
            .filter(
                Ticket.status == "ai_handling",
                last_activity.c.last_at < cutoff,
                Organization.subscription_status == "active"
            )
            .order_by(Ticket.id)
            .limit(IDLE_TICKETS_PER_SWEEP)
            .all()
        )

        # 2. Team tickets silent for longer, only in workspaces with AI auto-reply off (nothing else ever closes them there)
        #    Filtered in SQL, so other workspaces' old team tickets can't fill the batch
        team_cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=settings.TICKET_TEAM_IDLE_CLOSE_HOURS)
        room = IDLE_TICKETS_PER_SWEEP - len(tickets)
        team_tickets = (
            db.query(Ticket)
            .join(last_activity, last_activity.c.conversation_id == Ticket.conversation_id)
            .join(Organization, Ticket.organization_id == Organization.id)
            .join(OrganizationAISettings, OrganizationAISettings.organization_id == Ticket.organization_id)
            .filter(
                Ticket.status.in_(("open", "in_progress", "waiting")),
                last_activity.c.last_at < team_cutoff,
                Organization.subscription_status == "active",
                OrganizationAISettings.is_active.is_(False)
            )
            .order_by(Ticket.id)
            .limit(room)
            .all()
        ) if room > 0 else []

        # 3. File and close each one (one failing doesn't stop the rest); a team ticket's chat is released for the next message
        for ticket in tickets + team_tickets:
            try:
                close_ticket(db, ticket, "no_reply")
                if ticket in team_tickets:
                    release_chat_after_close(db, ticket.conversation)
                print(f"[TICKETS] closed idle ticket #{ticket.number} (org {ticket.organization_id})")
            except Exception as e:
                db.rollback()
                print(f"[TICKETS] could not close ticket {ticket.id}: {e}")

    finally:
        db.close()


@celery_app.task(name="remind_unassigned_chats_task")
def remind_unassigned_chats_task():
    thresholds = sorted({int(m) for m in settings.UNASSIGNED_REMINDER_MINUTES.split(",") if m.strip().isdigit()})
    if not thresholds:
        return

    db = SessionLocal()
    try:
        # 1. Chats the team has to pick up (handed over, nobody owns them), with when their ticket was handed over (skip suspended workspaces)
        handed_over = db.query(TicketActivity.ticket_id, func.max(TicketActivity.id).label("activity_id"), func.max(TicketActivity.created_at).label("at")).filter(
            TicketActivity.type == "escalated"
        ).group_by(TicketActivity.ticket_id).subquery()
        rows = (
            db.query(Conversation, handed_over.c.activity_id, handed_over.c.at)
            .join(Ticket, (Ticket.conversation_id == Conversation.id) & (Ticket.status != "closed"))
            .join(handed_over, handed_over.c.ticket_id == Ticket.id)
            .join(Organization, Conversation.organization_id == Organization.id)
            .filter(
                Conversation.status == ConversationStatus.HUMAN_TAKEOVER,
                Conversation.assigned_user_id.is_(None),
                Organization.subscription_status == "active"
            )
            .all()
        )

        now = datetime.now(timezone.utc)
        chats_on = {}  # Per workspace, for this run: with Customer Chats off the team can't open the chat
        for conversation, activity_id, handed_over_at in rows:
            org_id = conversation.organization_id
            if org_id not in chats_on:
                chats_on[org_id] = is_feature_enabled(db, org_id, "customer_chats")
            if not chats_on[org_id]:
                continue

            # 2. Reminders now due; each is sent once per handover (Redis remembers, so every-minute runs don't repeat it)
            waited_minutes = (now - handed_over_at).total_seconds() / 60
            due = [m for m in thresholds if waited_minutes >= m]
            newly_due = [m for m in due if redis_client.set(f"unassigned_reminder:{activity_id}:{m}", 1, nx=True, ex=REMINDER_KEY_EXPIRE_SECONDS)]
            if not newly_due:
                continue

            # 3. Several due at once (e.g. the worker was down): only the latest one is sent
            minutes = max(newly_due)
            preview = db.query(ChatMessage.content).filter(ChatMessage.conversation_id == conversation.id, ChatMessage.sender == "user").order_by(ChatMessage.id.desc()).limit(1).scalar()
            try:
                sent = notify_unassigned_reminder(db, conversation, minutes, minutes == thresholds[0], preview)
                print(f"[REMINDER] chat {conversation.id} waiting {int(waited_minutes)} min: reminded {len(sent)} people ({minutes} min reminder)")
            except Exception as e:
                db.rollback()
                print(f"[REMINDER] could not remind about chat {conversation.id}: {e}")

    finally:
        db.close()


@celery_app.task(name="clean_old_notifications_task")
def clean_old_notifications_task():
    db = SessionLocal()
    try:
        # 1. Read notifications older than the retention period (unread ones are never deleted; skip suspended workspaces)
        cutoff = datetime.now(timezone.utc) - timedelta(days=settings.NOTIFICATION_RETENTION_DAYS)
        active_org_ids = db.query(Organization.id).filter(Organization.subscription_status == "active").subquery()
        deleted = (
            db.query(Notification)
            .filter(
                Notification.organization_id.in_(active_org_ids),
                Notification.read_at.isnot(None),
                Notification.created_at < cutoff
            )
            .delete(synchronize_session=False)
        )
        db.commit()

        if deleted:
            print(f"[NOTIFICATIONS] deleted {deleted} read notifications older than {settings.NOTIFICATION_RETENTION_DAYS} days")

    finally:
        db.close()
