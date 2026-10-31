import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.models.conversation_model import ChatMessage, MessageStatus
from app.models.whatsapp_model import WhatsAppNumber
from app.services.whatsapp_service import (
    WhatsAppPermanentError,
    WhatsAppRetryableError,
    WhatsAppTokenError,
    PAIR_RATE_LIMIT_CODE,
    apply_status_update,
    callback_data_for,
    message_id_from_callback_data,
    send_text,
    send_template,
    send_interactive,
    interactive_payload,
    upload_media,
    send_media,
)
from app.models.contact_model import ContactOptOut
from app.models.broadcast_model import Broadcast, BroadcastRecipient
from app.models.organization_model import Organization
from app.core.redis_client import redis_client
from app.services.channel_service import mark_number_disconnected, NUMBER_DISCONNECTED_ERROR
from app.realtime.notify import notify_message_status

SEND_LOCK_SECONDS = 120  # Longer than one Meta request; released as soon as the task finishes
RETRY_MARKER_GRACE_SECONDS = 120  # Keep the "retry scheduled" marker a bit past the retry time


def retry_marker_key(message_id: int) -> str:
    return f"wa:send-retry:{message_id}"

RETRY_BASE_SECONDS = 30
PAIR_RATE_LIMIT_BASE_SECONDS = 120
# WhatsApp only allows free-form replies within 24 hours of the customer's last message
CUSTOMER_SERVICE_WINDOW = timedelta(hours=24)
WORKSPACE_SUSPENDED_ERROR = "Not sent: the workspace was suspended"


def _mark_failed(db: Session, message: ChatMessage, error: str) -> None:
    message.status = MessageStatus.FAILED
    message.error = error
    db.commit()
    notify_message_status(message)
    print(f"[WHATSAPP SEND FAILED] message={message.id}: {error}")


def _is_broadcast_message(db: Session, message: ChatMessage) -> bool:
    return message.message_type == "template" and db.query(BroadcastRecipient.id).filter(BroadcastRecipient.chat_message_id == message.id).first() is not None


def _as_utc(value: datetime) -> datetime:
    # created_at is stored without a timezone but always written in UTC
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@celery_app.task(name="send_whatsapp_message_task", bind=True, max_retries=5)
def send_whatsapp_message_task(self, message_id: int):
    """
    Sends one outgoing message (AI reply, agent reply or handover notice) to the customer
    on WhatsApp. Every outgoing message goes through here via queue_outgoing_message().
    """
    db = SessionLocal()
    lock_key = f"wa:send-lock:{message_id}"
    locked = False
    try:
        message = db.get(ChatMessage, message_id)
        # Only pending messages are sent, so a re-run or duplicate task never sends twice
        if not message or message.status != MessageStatus.PENDING:
            return

        # Only one worker sends a given message at a time (Resume can re-queue a message that is already queued)
        locked = bool(redis_client.set(lock_key, 1, nx=True, ex=SEND_LOCK_SECONDS))
        if not locked:
            return

        conversation = message.conversation

        number = None
        if conversation.phone_number_id:
            number = db.query(WhatsAppNumber).filter_by(
                organization_id=conversation.organization_id,
                phone_number_id=conversation.phone_number_id,
            ).first()
        if not number:
            _mark_failed(db, message, "No WhatsApp number connected for this conversation")
            return

        # Disconnected number: no Meta call; broadcast messages stay pending for Resume, others fail
        if number.status == "disconnected":
            if _is_broadcast_message(db, message):
                return
            _mark_failed(db, message, NUMBER_DISCONNECTED_ERROR)
            return

        # Inactive (suspended) workspace: no messages sent; broadcast messages pause with workspace_inactive
        org = db.query(Organization).filter(Organization.id == conversation.organization_id).first()
        if not org or org.subscription_status == "inactive" or org.subscription_status != "active":
            if _is_broadcast_message(db, message):
                recipient = db.query(BroadcastRecipient).filter(BroadcastRecipient.chat_message_id == message.id).first()
                broadcast = recipient.broadcast if recipient else None
                if broadcast and (broadcast.status != "paused" or broadcast.pause_reason not in ("workspace_inactive", "workspace_suspended")):
                    broadcast.status = "paused"
                    broadcast.pause_reason = "workspace_inactive"
                    broadcast.paused_at = datetime.now(timezone.utc)
                    broadcast.resume_at = None
                    broadcast.dispatch_token = None
                    db.commit()
                    print(f"[BROADCAST] {broadcast.id}: paused, workspace {conversation.organization_id} is inactive (suspended)")
                return
            # A normal reply is failed, not left pending: otherwise the stuck-message sweeper would send it
            # (possibly days late) as soon as the workspace is reactivated
            _mark_failed(db, message, WORKSPACE_SUSPENDED_ERROR)
            return

        if message.message_type == "template":
            # Broadcast messages stop when the number is flagged (RED) or the broadcast is paused for quality
            recipient = db.query(BroadcastRecipient).filter(BroadcastRecipient.chat_message_id == message.id).first()
            broadcast = recipient.broadcast if recipient else None
            if broadcast and (number.quality_rating == "RED" or (broadcast.status == "paused" and broadcast.pause_reason == "quality_low")):
                if broadcast.pause_reason != "quality_low":
                    broadcast.status = "paused"
                    broadcast.pause_reason = "quality_low"
                    broadcast.paused_at = datetime.now(timezone.utc)
                    broadcast.dispatch_token = None
                    db.commit()
                    print(f"[BROADCAST] {broadcast.id}: paused, number quality is low")
                # The message stays pending; Resume re-queues it
                return

            # Templates may be sent outside the 24-hour window, but never to someone who opted out
            opted_out = db.query(ContactOptOut.id).filter(
                ContactOptOut.organization_id == conversation.organization_id,
                ContactOptOut.customer_phone == conversation.customer_phone
            ).first()
            if opted_out:
                _mark_failed(db, message, "Customer opted out of messages")
                return
        else:
            last_customer_message = (
                db.query(ChatMessage.created_at)
                .filter(ChatMessage.conversation_id == conversation.id, ChatMessage.sender == "user")
                .order_by(ChatMessage.id.desc())
                .first()
            )
            window_start = datetime.now(timezone.utc) - CUSTOMER_SERVICE_WINDOW
            if not last_customer_message or _as_utc(last_customer_message.created_at) < window_start:
                _mark_failed(db, message, "Outside the 24-hour window; a template message is required")
                return

        # Lets a later status webhook mark this row sent even if the response is lost;
        # the delayed retry then sees it's no longer pending and doesn't send again
        callback_data = callback_data_for(message.id)

        try:
            if message.message_type == "template":
                wamid = send_template(number.phone_number_id, number.access_token, conversation.customer_phone, message.template_data, callback_data=callback_data)
            elif message.message_type in ("image", "document"):
                # Agent's file: upload once (the media id is kept for retries), then send it
                attachment = message.attachment
                if not attachment.media_id:
                    with open(os.path.join(settings.MEDIA_STORAGE_PATH, attachment.storage_path), "rb") as f:
                        attachment.media_id = upload_media(number.phone_number_id, number.access_token, f.read(), attachment.mime_type, attachment.file_name or "file")
                    db.commit()
                caption = None if message.content.startswith("[Sent ") else message.content
                wamid = send_media(number.phone_number_id, number.access_token, conversation.customer_phone, message.message_type, attachment.media_id, caption, attachment.file_name, callback_data=callback_data)
            elif message.message_type == "interactive":
                wamid = send_interactive(number.phone_number_id, number.access_token, conversation.customer_phone, interactive_payload(message.content, message.template_data or {}), callback_data=callback_data)
            else:
                wamid = send_text(number.phone_number_id, number.access_token, conversation.customer_phone, message.content, callback_data=callback_data)
        except WhatsAppTokenError as exc:
            # Token stopped working: mark the number disconnected (pauses its broadcasts)
            mark_number_disconnected(db, number, exc)
            if _is_broadcast_message(db, message):
                return
            _mark_failed(db, message, NUMBER_DISCONNECTED_ERROR)
            return
        except WhatsAppPermanentError as exc:
            _mark_failed(db, message, str(exc))
            return
        except WhatsAppRetryableError as exc:
            if self.request.retries >= self.max_retries:
                _mark_failed(db, message, f"Gave up after {self.max_retries + 1} attempts: {exc}")
                return
            # Too many messages to this customer: 2, 4, 8, 16, 32 min; anything else: 30s, 60s, 120s, 240s, 480s
            base_seconds = PAIR_RATE_LIMIT_BASE_SECONDS if exc.code == PAIR_RATE_LIMIT_CODE else RETRY_BASE_SECONDS
            countdown = base_seconds * 2 ** self.request.retries
            # Tell the stuck-message sweeper a retry is already scheduled for this message
            redis_client.set(retry_marker_key(message.id), 1, ex=countdown + RETRY_MARKER_GRACE_SECONDS)
            raise self.retry(exc=exc, countdown=countdown)

        # Forward-only: a status webhook may already have marked it delivered/read
        db.refresh(message)
        apply_status_update(db, wamid, MessageStatus.SENT, message_id=message.id)
    finally:
        # Release the lock so a scheduled retry can send
        if locked:
            redis_client.delete(lock_key)
        db.close()


@celery_app.task(name="process_whatsapp_status_task")
def process_whatsapp_status_task(wamid: str, status: str, error: Optional[str] = None, callback_data: Optional[str] = None):
    """Applies a delivery update (sent / delivered / read / failed) from Meta's status webhook."""
    try:
        new_status = MessageStatus(status)
    except ValueError:
        return  # other statuses (e.g. "deleted") don't affect delivery ticks

    db = SessionLocal()
    try:
        apply_status_update(db, wamid, new_status, error, message_id=message_id_from_callback_data(callback_data))
    finally:
        db.close()


@celery_app.task(name="process_quality_update_task")
def process_quality_update_task(waba_id: str, display_phone_number: str, event: str, current_limit: Optional[str] = None):
    db = SessionLocal()
    try:
        # 1. Find the number: Meta sends the WABA id and the display number, not the phone_number_id
        digits = re.sub(r"\D", "", display_phone_number or "")
        numbers = db.query(WhatsAppNumber).filter(WhatsAppNumber.waba_id == waba_id).all()
        number = next((n for n in numbers if re.sub(r"\D", "", n.display_phone_number or "") == digits), None)

        if not number:
            print(f"[QUALITY UPDATE] Unknown number {display_phone_number} (WABA {waba_id}); ignoring")
            return

        # 2. FLAGGED = quality dropped to low; UNFLAGGED = back above low (exact level comes with the next refresh)
        if event == "FLAGGED":
            number.quality_rating = "RED"
        elif event == "UNFLAGGED" and number.quality_rating == "RED":
            number.quality_rating = "YELLOW"

        # 3. Messaging tier changes (UPGRADE / DOWNGRADE, a flag can also come with a lower limit)
        if current_limit and current_limit.startswith("TIER_"):
            number.messaging_tier = current_limit

        # 4. Flagged: pause this number's running broadcasts right away (Resume is manual)
        if event == "FLAGGED":
            pause_number_broadcasts(db, number)

        db.commit()
        print(f"[QUALITY UPDATE] {number.display_phone_number}: {event} -> quality={number.quality_rating} tier={number.messaging_tier}")

    finally:
        db.close()


def pause_number_broadcasts(db: Session, number: WhatsAppNumber, reason: str = "quality_low") -> int:
    # Low quality / disconnected: every running or tier-paused broadcast of this number waits for a manual Resume
    broadcasts = db.query(Broadcast).filter(
        Broadcast.organization_id == number.organization_id,
        Broadcast.phone_number_id == number.phone_number_id,
        Broadcast.status.in_(["queued", "sending", "paused"])
    ).all()

    for broadcast in broadcasts:
        broadcast.status = "paused"
        broadcast.pause_reason = reason
        broadcast.paused_at = datetime.now(timezone.utc)
        broadcast.resume_at = None
        broadcast.dispatch_token = None

    return len(broadcasts)
