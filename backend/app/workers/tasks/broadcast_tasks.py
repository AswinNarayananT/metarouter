import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.models.conversation_model import ChatMessage, MessageStatus
from app.models.broadcast_model import Broadcast, BroadcastRecipient
from app.models.whatsapp_model import WhatsAppNumber
from app.models.organization_model import Organization
from app.services.broadcast_service import render_body, check_number_quality, tier_capacity
from app.workers.tasks.chat_tasks import _get_or_create_conversation
from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task
from app.realtime.notify import notify_conversations_changed

NEXT_BATCH_BUFFER_SECONDS = 5


@celery_app.task(name="process_broadcast_task")
def process_broadcast_task(broadcast_id: int, dispatch_token: Optional[str] = None):
    db = SessionLocal()
    try:
        # 1. Lock the broadcast so only one dispatcher run releases messages at a time
        broadcast = db.query(Broadcast).filter(Broadcast.id == broadcast_id).with_for_update().first()
        if not broadcast:
            return

        # A newer run was scheduled (e.g. after Resume), so this one is stale
        if dispatch_token != broadcast.dispatch_token:
            db.rollback()
            return

        # Finished broadcasts, quality, disconnect and workspace inactive (suspended) pauses (only Resume restarts those) do nothing
        if broadcast.status in ("completed", "failed") or (broadcast.status == "paused" and broadcast.pause_reason in ("quality_low", "number_disconnected", "workspace_inactive", "workspace_suspended")):
            db.rollback()
            return

        # Workspace is inactive (suspended): pause this broadcast right away
        org = db.query(Organization).filter(Organization.id == broadcast.organization_id).first()
        if not org or org.subscription_status == "inactive" or org.subscription_status != "active":
            _pause(broadcast, "workspace_inactive")
            broadcast.dispatch_token = None
            db.commit()
            print(f"[BROADCAST] {broadcast.id}: paused, workspace {broadcast.organization_id} is inactive (suspended)")
            return

        number = db.query(WhatsAppNumber).filter(
            WhatsAppNumber.organization_id == broadcast.organization_id,
            WhatsAppNumber.phone_number_id == broadcast.phone_number_id
        ).first()
        if not number:
            broadcast.status = "failed"
            broadcast.error = "The WhatsApp number of this broadcast is no longer connected"
            broadcast.dispatch_token = None
            db.commit()
            return

        # Token stopped working: wait until the number is reconnected and the admin resumes
        if number.status == "disconnected":
            _pause(broadcast, "number_disconnected")
            broadcast.dispatch_token = None
            db.commit()
            print(f"[BROADCAST] {broadcast.id}: paused, WhatsApp number is disconnected")
            return

        # 2. Quality: a RED (flagged) number pauses the broadcast until the admin resumes it
        if check_number_quality(number)["blocked"]:
            _pause(broadcast, "quality_low")
            broadcast.dispatch_token = None
            db.commit()
            print(f"[BROADCAST] {broadcast.id}: paused, number quality is low")
            return

        pending_count = db.query(BroadcastRecipient.id).filter(
            BroadcastRecipient.broadcast_id == broadcast.id,
            BroadcastRecipient.status == "pending"
        ).count()

        # 3. Everyone released: stop the chain (shows completed once the last messages are sent)
        if pending_count == 0:
            broadcast.status = "sending"
            broadcast.pause_reason = None
            broadcast.resume_at = None
            broadcast.dispatch_token = None
            db.commit()
            return

        # 4. Tier: release only what the 24-hour limit allows; the rest continues automatically later
        batch_size = settings.BROADCAST_DISPATCH_BATCH_SIZE
        capacity = tier_capacity(db, number)
        if capacity["remaining"] is not None:
            if capacity["remaining"] == 0:
                # resume_due_broadcasts_task (Celery Beat) restarts it once resume_at has passed
                resume_at = capacity["resume_at"] or datetime.now(timezone.utc) + timedelta(hours=1)
                _pause(broadcast, "tier_limit")
                broadcast.resume_at = resume_at
                broadcast.dispatch_token = None
                db.commit()
                print(f"[BROADCAST] {broadcast.id}: daily limit reached, continues at {resume_at.isoformat()}")
                return
            batch_size = min(batch_size, capacity["remaining"])

        broadcast.status = "sending"
        broadcast.pause_reason = None
        broadcast.paused_at = None
        broadcast.resume_at = None

        recipients = db.query(BroadcastRecipient).filter(
            BroadcastRecipient.broadcast_id == broadcast.id,
            BroadcastRecipient.status == "pending"
        ).order_by(BroadcastRecipient.id).limit(batch_size).all()

        # 5. Create this batch's messages (created now, so tier counting matches the send time)
        message_ids = []
        for recipient in recipients:
            # Every recipient gets a conversation so replies and delivery ticks land in the chat
            conversation = _get_or_create_conversation(db, broadcast.organization_id, broadcast.phone_number_id, recipient.customer_phone)
            # Name from the contact list until the customer replies with their WhatsApp profile name
            if recipient.name and not conversation.customer_name:
                conversation.customer_name = recipient.name[:255]

            # {{1}} = the contact's name when chosen, then the admin's values
            parameters = list(broadcast.variables or [])
            if broadcast.use_contact_name:
                parameters = [recipient.name or settings.BROADCAST_DEFAULT_NAME] + parameters

            message = ChatMessage(
                conversation_id=conversation.id,
                sender="broadcast",
                message_type="template",
                content=render_body(broadcast.template_body, parameters) or f"[Template: {broadcast.template_name}]",
                template_data={
                    "name": broadcast.template_name,
                    "language": broadcast.template_language,
                    "parameters": parameters
                },
                status=MessageStatus.PENDING
            )
            db.add(message)
            db.flush()

            recipient.chat_message_id = message.id
            recipient.status = "queued"
            message_ids.append(message.id)

        # 6. More left? schedule the next batch for when this one has gone out
        has_more = pending_count > len(message_ids)
        token = _new_token(broadcast) if has_more else None
        broadcast.dispatch_token = token
        db.commit()

        # Spread the sends so the number stays under Meta's throughput limit
        for index, message_id in enumerate(message_ids):
            send_whatsapp_message_task.apply_async(args=[message_id], countdown=index // settings.BROADCAST_MESSAGES_PER_SECOND)

        if has_more:
            wait_seconds = math.ceil(len(message_ids) / settings.BROADCAST_MESSAGES_PER_SECOND) + NEXT_BATCH_BUFFER_SECONDS
            process_broadcast_task.apply_async(kwargs={"broadcast_id": broadcast.id, "dispatch_token": token}, countdown=wait_seconds)

        # One refresh for the whole batch instead of an event per recipient
        if message_ids:
            notify_conversations_changed(broadcast.organization_id, "broadcast")

        print(f"[BROADCAST] {broadcast.id}: released {len(message_ids)} messages, {pending_count - len(message_ids)} left")

    except Exception as exc:
        db.rollback()
        broadcast = db.query(Broadcast).filter(Broadcast.id == broadcast_id).first()
        if broadcast:
            broadcast.status = "failed"
            broadcast.error = str(exc)[:1000]
            broadcast.dispatch_token = None
            db.commit()
        print(f"[BROADCAST FAILED] {broadcast_id}: {exc}")
        raise

    finally:
        db.close()


def _pause(broadcast: Broadcast, reason: str):
    broadcast.status = "paused"
    broadcast.pause_reason = reason
    broadcast.paused_at = datetime.now(timezone.utc)


def _new_token(broadcast: Broadcast) -> str:
    broadcast.dispatch_token = uuid.uuid4().hex
    return broadcast.dispatch_token
