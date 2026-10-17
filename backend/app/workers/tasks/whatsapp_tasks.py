from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.models.ai_chat import ChatMessage, MessageStatus
from app.models.whatsapp_model import WhatsAppNumber
from app.services.whatsapp_service import (
    WhatsAppPermanentError,
    WhatsAppRetryableError,
    PAIR_RATE_LIMIT_CODE,
    apply_status_update,
    callback_data_for,
    message_id_from_callback_data,
    send_text,
    send_template,
)
from app.models.contact_model import ContactOptOut

RETRY_BASE_SECONDS = 30
PAIR_RATE_LIMIT_BASE_SECONDS = 120
# WhatsApp only allows free-form replies within 24 hours of the customer's last message
CUSTOMER_SERVICE_WINDOW = timedelta(hours=24)


def _mark_failed(db: Session, message: ChatMessage, error: str) -> None:
    message.status = MessageStatus.FAILED
    message.error = error
    db.commit()
    print(f"[WHATSAPP SEND FAILED] message={message.id}: {error}")


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
    try:
        message = db.get(ChatMessage, message_id)
        # Only pending messages are sent, so a re-run or duplicate task never sends twice
        if not message or message.status != MessageStatus.PENDING:
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

        if message.message_type == "template":
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
            else:
                wamid = send_text(number.phone_number_id, number.access_token, conversation.customer_phone, message.content, callback_data=callback_data)
        except WhatsAppPermanentError as exc:
            _mark_failed(db, message, str(exc))
            return
        except WhatsAppRetryableError as exc:
            if self.request.retries >= self.max_retries:
                _mark_failed(db, message, f"Gave up after {self.max_retries + 1} attempts: {exc}")
                return
            # Too many messages to this customer: 2, 4, 8, 16, 32 min; anything else: 30s, 60s, 120s, 240s, 480s
            base_seconds = PAIR_RATE_LIMIT_BASE_SECONDS if exc.code == PAIR_RATE_LIMIT_CODE else RETRY_BASE_SECONDS
            raise self.retry(exc=exc, countdown=base_seconds * 2 ** self.request.retries)

        # Forward-only: a status webhook may already have marked it delivered/read
        db.refresh(message)
        apply_status_update(db, wamid, MessageStatus.SENT, message_id=message.id)
    finally:
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
