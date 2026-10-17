from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.models.ai_chat import Conversation, ChatMessage, ConversationStatus
from app.models.whatsapp_model import WhatsAppNumber
from app.models.contact_model import ContactOptOut
from app.config import settings
from app.services.ai_service import generate_ai_response
from app.services.messaging_service import queue_outgoing_message

ESCALATION_TAG = "[ESCALATE_TO_HUMAN]"
HANDOVER_FALLBACK_TEXT = "I'm connecting you with our team. Someone will reply shortly."
OPT_OUT_CONFIRMATION_TEXT = "You've been unsubscribed and won't receive promotional messages from us. Reply START to subscribe again."
OPT_IN_CONFIRMATION_TEXT = "You're subscribed again. Reply STOP anytime to unsubscribe."


def _get_or_create_conversation(
    db: Session, organization_id: int, phone_number_id: Optional[str], customer_phone: str
) -> Conversation:
    # One conversation per customer per business number
    lookup = dict(organization_id=organization_id, phone_number_id=phone_number_id, customer_phone=customer_phone)
    conversation = db.query(Conversation).filter_by(**lookup).first()
    if conversation:
        return conversation

    conversation = Conversation(**lookup, status=ConversationStatus.ACTIVE)
    db.add(conversation)
    try:
        db.commit()
    except IntegrityError:
        # Another task created it at the same moment (first messages arriving together)
        db.rollback()
        return db.query(Conversation).filter_by(**lookup).one()
    db.refresh(conversation)
    return conversation


@celery_app.task(name="process_chat_message_task")
def process_chat_message_task(
    phone_number_id: str,
    customer_phone: str,
    user_text: str,
    wamid: Optional[str] = None,
):
    db = SessionLocal()
    try:
        # 0. Which organization owns the business number the customer wrote to
        number = (
            db.query(WhatsAppNumber.organization_id)
            .filter(WhatsAppNumber.phone_number_id == phone_number_id)
            .first()
        )
        if not number:
            print(f"[WEBHOOK] Message for unknown phone_number_id {phone_number_id}; ignoring")
            return
        organization_id = number.organization_id

        # 1. Get or create conversation
        conversation = _get_or_create_conversation(db, organization_id, phone_number_id, customer_phone)

        # 2. Save incoming user message (the unique wamid rejects webhooks Meta delivers twice)
        user_msg = ChatMessage(conversation_id=conversation.id, sender="user", content=user_text, wamid=wamid)
        db.add(user_msg)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if wamid and db.query(ChatMessage.id).filter(ChatMessage.wamid == wamid).first():
                print(f"[DUPLICATE] Ignoring re-delivered message {wamid}")
                return
            raise

        # 3. STOP / START keywords: update the opt-out list and confirm, no AI reply
        keyword = user_text.strip().upper()
        opt_out_keywords = {k.strip().upper() for k in settings.OPT_OUT_KEYWORDS.split(",") if k.strip()}
        opt_in_keywords = {k.strip().upper() for k in settings.OPT_IN_KEYWORDS.split(",") if k.strip()}

        if keyword in opt_out_keywords:
            if not db.query(ContactOptOut.id).filter(ContactOptOut.organization_id == organization_id, ContactOptOut.customer_phone == customer_phone).first():
                db.add(ContactOptOut(organization_id=organization_id, customer_phone=customer_phone, source="keyword"))
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()  # Already opted out by a parallel message
            queue_outgoing_message(db, conversation, sender="model", content=OPT_OUT_CONFIRMATION_TEXT)
            return

        if keyword in opt_in_keywords:
            db.query(ContactOptOut).filter(ContactOptOut.organization_id == organization_id, ContactOptOut.customer_phone == customer_phone).delete()
            db.commit()
            queue_outgoing_message(db, conversation, sender="model", content=OPT_IN_CONFIRMATION_TEXT)
            return

        # 4. Human takeover: keep the message for the agent, AI stays silent
        if conversation.status == ConversationStatus.HUMAN_TAKEOVER:
            return

        # 5. Generate and send the AI reply
        reply_with_ai(db, conversation, user_text)

    finally:
        db.close()


def reply_with_ai(db: Session, conversation: Conversation, user_text: str):
    # 1. Generate AI reply
    ai_raw_reply = generate_ai_response(db, conversation, user_text)

    # 2. Handle Human Handover Detection
    if ESCALATION_TAG in ai_raw_reply:
        conversation.status = ConversationStatus.HUMAN_TAKEOVER
        db.commit()

        clean_reply = ai_raw_reply.replace(ESCALATION_TAG, "").strip() or HANDOVER_FALLBACK_TEXT
        queue_outgoing_message(db, conversation, sender="model", content=clean_reply)

        # TODO: Notify the dashboard (WebSocket) that a human is needed
        print(f"[ALERT] Handover triggered for Org {conversation.organization_id}, Customer: {conversation.customer_phone}")
    else:
        queue_outgoing_message(db, conversation, sender="model", content=ai_raw_reply)
