from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus
from app.models.organization_model import Organization
from app.models.whatsapp_model import WhatsAppNumber
from app.models.contact_model import ContactOptOut
from app.config import settings
from app.services.ai_service import generate_ai_response
from app.services.messaging_service import queue_outgoing_message
from app.realtime.notify import notify_new_messages, notify_handover
from app.services.conversation_service import record_activity
from app.services.notification_service import notify_team_of_handover
from app.services.ticket_service import start_ticket_session, escalate_ticket, get_open_ticket, close_ticket

ESCALATION_TAG = "[ESCALATE_TO_HUMAN]"
RESOLVED_TAG = "[RESOLVED]"  # The customer needs nothing else: the AI closes the ticket
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


def update_customer_profile(db: Session, conversation: Conversation, customer_name: Optional[str] = None, customer_user_id: Optional[str] = None, referral: Optional[dict] = None):
    # 1. WhatsApp profile name: always the latest (replaces a broadcast contact list name)
    changed = False
    if customer_name and customer_name.strip() and conversation.customer_name != customer_name.strip()[:255]:
        conversation.customer_name = customer_name.strip()[:255]
        changed = True

    # 2. Business-scoped user id (BSUID), sent once WhatsApp usernames roll out
    if customer_user_id and conversation.customer_wa_user_id != customer_user_id:
        conversation.customer_wa_user_id = customer_user_id[:160]
        changed = True

    # 3. Ad the customer first came from (later ad clicks don't overwrite it)
    if referral and not conversation.ad_referral:
        conversation.ad_referral = referral
        changed = True

    if changed:
        db.commit()


@celery_app.task(name="process_chat_message_task")
def process_chat_message_task(
    phone_number_id: str,
    customer_phone: str,
    user_text: str,
    wamid: Optional[str] = None,
    customer_name: Optional[str] = None,
    customer_user_id: Optional[str] = None,
    referral: Optional[dict] = None,
    message_type: str = "text",
    message_data: Optional[dict] = None,
    ai_reply: bool = True,
):
    db = SessionLocal()
    try:
        # 0. Which organization owns the business number the customer wrote to
        number = (
            db.query(WhatsAppNumber.organization_id, WhatsAppNumber.status)
            .filter(WhatsAppNumber.phone_number_id == phone_number_id)
            .first()
        )
        if not number:
            print(f"[WEBHOOK] Message for unknown phone_number_id {phone_number_id}; ignoring")
            return
        organization_id = number.organization_id
        # Disconnected number: keep the message (and STOP/START), but nothing can be sent back
        disconnected = number.status == "disconnected"

        # Check if the workspace is inactive (suspended)
        org = db.query(Organization).filter(Organization.id == organization_id).first()
        is_inactive = (not org) or (org.subscription_status == "inactive") or (org.subscription_status != "active")

        # 1. Get or create conversation, and keep the customer's name / id / ad up to date
        conversation = _get_or_create_conversation(db, organization_id, phone_number_id, customer_phone)
        update_customer_profile(db, conversation, customer_name, customer_user_id, referral)

        # 2. Save incoming user message (the unique wamid rejects webhooks Meta delivers twice)
        # message_type / message_data: location (coordinates) and shared contacts keep their details for the bubble
        user_msg = ChatMessage(conversation_id=conversation.id, sender="user", content=user_text, wamid=wamid, message_type=message_type, template_data=message_data)
        db.add(user_msg)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if wamid and db.query(ChatMessage.id).filter(ChatMessage.wamid == wamid).first():
                print(f"[DUPLICATE] Ignoring re-delivered message {wamid}")
                return
            raise
        notify_new_messages(db, [user_msg])

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
            if not disconnected and not is_inactive:
                queue_outgoing_message(db, conversation, sender="model", content=OPT_OUT_CONFIRMATION_TEXT)
            return

        if keyword in opt_in_keywords:
            db.query(ContactOptOut).filter(ContactOptOut.organization_id == organization_id, ContactOptOut.customer_phone == customer_phone).delete()
            db.commit()
            if not disconnected and not is_inactive:
                queue_outgoing_message(db, conversation, sender="model", content=OPT_IN_CONFIRMATION_TEXT)
            return

        # Support session: the first customer message opens a ticket, later ones belong to it
        start_ticket_session(db, conversation, user_msg.id)

        # 4. Human takeover: keep the message for the agent, AI stays silent
        if conversation.status == ConversationStatus.HUMAN_TAKEOVER:
            return

        # 5. Disconnected: no AI reply (it couldn't be delivered)
        if disconnected:
            print(f"[WEBHOOK] {phone_number_id} is disconnected; saved the message without an AI reply")
            return

        # 6. Inactive (suspended) workspace: save incoming messages, but send no AI reply
        if is_inactive:
            print(f"[WEBHOOK] Workspace {organization_id} is inactive (suspended); saved the message without an AI reply")
            return

        # 7. Generate and send the AI reply (not for messages with nothing to answer, e.g. an unsupported type)
        if ai_reply:
            reply_with_ai(db, conversation, user_text)

    finally:
        db.close()


def reply_with_ai(db: Session, conversation: Conversation, user_text: str):
    # Inactive (suspended) workspace: send no AI reply
    org = db.query(Organization).filter(Organization.id == conversation.organization_id).first()
    if not org or org.subscription_status == "inactive" or org.subscription_status != "active":
        print(f"[AI REPLY] Workspace {conversation.organization_id} is inactive (suspended); skipping AI reply")
        return

    # 1. Generate AI reply
    ai_raw_reply = generate_ai_response(db, conversation, user_text)

    # Empty reply (can't be sent): hand over to the team instead of staying silent
    if not ai_raw_reply or not ai_raw_reply.strip():
        ai_raw_reply = f"{ESCALATION_TAG} {HANDOVER_FALLBACK_TEXT}"

    # 2. Handle Human Handover Detection
    if ESCALATION_TAG in ai_raw_reply:
        conversation.status = ConversationStatus.HUMAN_TAKEOVER
        db.commit()

        clean_reply = ai_raw_reply.replace(ESCALATION_TAG, "").strip() or HANDOVER_FALLBACK_TEXT
        queue_outgoing_message(db, conversation, sender="model", content=clean_reply)

        # Alert the team in the dashboard that a human is needed; the ticket becomes a team ticket
        record_activity(db, conversation, "The AI handed this chat to the team")
        escalate_ticket(db, conversation)
        notify_team_of_handover(db, conversation, user_text)
        notify_handover(db, conversation)
        print(f"[ALERT] Handover triggered for Org {conversation.organization_id}, Customer: {conversation.customer_phone}")
    elif RESOLVED_TAG in ai_raw_reply:
        # 3. The customer needs nothing else: say goodbye, then file and close the ticket
        clean_reply = ai_raw_reply.replace(RESOLVED_TAG, "").strip() or "Glad I could help! Have a great day."
        queue_outgoing_message(db, conversation, sender="model", content=clean_reply)
        ticket = get_open_ticket(db, conversation.id)
        if ticket:
            close_ticket(db, ticket, "resolved_by_ai")
    else:
        queue_outgoing_message(db, conversation, sender="model", content=ai_raw_reply)


@celery_app.task(name="process_reaction_task")
def process_reaction_task(phone_number_id: str, reacted_wamid: str, emoji: Optional[str]):
    # A customer's emoji reaction: shown on the message it reacts to; no new message, no AI reply
    db = SessionLocal()
    try:
        # 1. The reacted-to message, in a chat of the business number that received the reaction
        message = db.query(ChatMessage).join(Conversation, Conversation.id == ChatMessage.conversation_id).filter(
            ChatMessage.wamid == reacted_wamid,
            Conversation.phone_number_id == phone_number_id
        ).first()
        if not message:
            return

        # 2. An empty emoji means the reaction was removed
        message.reaction = (emoji or "").strip()[:32] or None
        db.commit()
        notify_new_messages(db, [message])
    finally:
        db.close()
