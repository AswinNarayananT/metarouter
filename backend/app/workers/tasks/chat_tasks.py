from datetime import datetime, timezone
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
from app.core.features import is_feature_enabled
from app.services.ai_service import generate_ai_response
from app.services.messaging_service import queue_outgoing_message, queue_interactive_message
from app.services.intent_service import enabled_intent_options, greeting_text, greeting_buttons, tapped_intent, classify_first_message
from app.services.order_chat_service import (
    ORDERING_PROMPT, PRODUCT_LIST_OFFER, VIEW_PRODUCTS_BUTTON, NO_PRODUCTS_TEXT, BROWSE_PREFIX, CATEGORY_PREFIX, PRODUCT_PREFIX,
    category_menu, product_menu, parse_browse_reply, parse_category_reply, tapped_product, product_detail_text, workspace_currency
)
from app.realtime.notify import notify_new_messages, notify_handover
from app.services.conversation_service import record_activity, ai_auto_reply_on, begin_visit_if_new, visit_first_message_id, last_conversation_activity_at
from app.services.notification_service import notify_team_of_handover
from app.services.ticket_service import start_ticket_session, escalate_ticket, get_open_ticket, close_ticket

ESCALATION_TAG = "[ESCALATE_TO_HUMAN]"
RESOLVED_TAG = "[RESOLVED]"  # The customer needs nothing else: the AI closes the ticket
ISSUE_TAG = "[ISSUE]"  # The customer reported a problem: a ticket opens to track it
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
        previous_activity_at = last_conversation_activity_at(db, conversation.id)
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
        begin_visit_if_new(db, conversation, previous_activity_at, user_msg)

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

        # Customer Chats off (it includes the AI assistant and tickets): keep the message, no ticket or AI reply
        if not is_feature_enabled(db, organization_id, "customer_chats"):
            print(f"[WEBHOOK] Customer Chats is off for workspace {organization_id}; saved the message without a ticket or AI reply")
            return

        # 4. Human takeover: keep the message for the agent, AI stays silent
        # The team tracks it as a ticket (a new team ticket if the last one was closed); AI chats get one only for a problem
        if conversation.status == ConversationStatus.HUMAN_TAKEOVER:
            start_ticket_session(db, conversation, user_msg.id)
            return

        # 5. Disconnected: no AI reply (it couldn't be delivered)
        if disconnected:
            print(f"[WEBHOOK] {phone_number_id} is disconnected; saved the message without an AI reply")
            return

        # 6. Inactive (suspended) workspace: save incoming messages, but send no AI reply
        if is_inactive:
            print(f"[WEBHOOK] Workspace {organization_id} is inactive (suspended); saved the message without an AI reply")
            return

        # 7. Menu taps, what the customer came for, then the AI reply (not for messages with nothing to answer, e.g. an unsupported type)
        reply_id = (message_data or {}).get("reply_id")
        if ai_reply or reply_id:
            respond_to_customer(db, conversation, user_text, reply_id)

    finally:
        db.close()


AUTO_REPLY_OFF_CHAT_NOTE = "AI auto-reply is off: sent to the team"
AUTO_REPLY_OFF_TICKET_NOTE = "Sent to the team (AI auto-reply is off)"


def hand_over_to_team(db: Session, conversation: Conversation, user_text: str, chat_note: str, ticket_note: Optional[str] = None):
    # The AI stays silent from now on; the ticket becomes a team ticket and the team is alerted that a human is needed
    conversation.status = ConversationStatus.HUMAN_TAKEOVER
    db.commit()

    record_activity(db, conversation, chat_note)
    escalate_ticket(db, conversation, note=ticket_note)
    notify_team_of_handover(db, conversation, user_text)
    notify_handover(db, conversation)
    print(f"[ALERT] Handover triggered for Org {conversation.organization_id}, Customer: {conversation.customer_phone}")


SUPPORT_PROMPT_TEXT = "Sorry to hear that. Please tell us what went wrong."
OTHER_PROMPT_TEXT = "Sure! What can we help you with?"


def respond_to_customer(db: Session, conversation: Conversation, user_text: str, reply_id: Optional[str] = None):
    # Customer Chats off (it includes the menus and the AI): nothing is sent
    if not is_feature_enabled(db, conversation.organization_id, "customer_chats"):
        return
    # 1. Taps on the product menus
    if handle_browse_tap(db, conversation, reply_id):
        return
    # 2. What the customer came for (asked once per visit): order, problem or something else
    if route_intent(db, conversation, user_text, reply_id):
        return
    # 3. Everything else: the AI answers
    reply_with_ai(db, conversation, user_text)


def send_greeting_menu(db: Session, conversation: Conversation, options: list):
    queue_interactive_message(db, conversation, greeting_text(db, conversation), buttons=greeting_buttons(options))
    conversation.menu_sent_at = datetime.now(timezone.utc)
    db.commit()


def route_intent(db: Session, conversation: Conversation, user_text: str, reply_id: Optional[str]) -> bool:
    # True = handled here (no AI reply); False = let the AI answer
    options = enabled_intent_options(db, conversation.organization_id)
    allowed = {option["id"] for option in options} | {"other"}

    # 1. A tap on the greeting menu (an option whose module was switched off since is just text for the AI)
    intent = tapped_intent(reply_id)
    if intent:
        if intent not in allowed:
            return False
        conversation.intent = intent
        db.commit()
        return start_intent(db, conversation, intent, user_text, tapped=True)

    # 2. Already known this visit, or only one option (nothing to ask): the normal flow
    if conversation.intent or len(options) < 2:
        return False

    # 3. AI auto-reply off: no Gemini, the customer picks from the menu (a typed answer goes to the team)
    if not ai_auto_reply_on(db, conversation.organization_id):
        if conversation.menu_sent_at:
            conversation.intent = "other"
            db.commit()
            return False
        send_greeting_menu(db, conversation, options)
        return True

    # 4. A clear first message skips the menu; a greeting gets it (asked once: after that the AI answers)
    result = classify_first_message(user_text)
    if result == "unclear" or result not in allowed:
        if conversation.menu_sent_at or result != "unclear":
            conversation.intent = "other"
            db.commit()
            return False
        send_greeting_menu(db, conversation, options)
        return True

    conversation.intent = result
    db.commit()
    return start_intent(db, conversation, result, user_text, tapped=False)


def start_intent(db: Session, conversation: Conversation, intent: str, user_text: str, tapped: bool) -> bool:
    ai_on = ai_auto_reply_on(db, conversation.organization_id)

    # Order: the product list (works without the AI, it's all taps); no ticket
    # A typed order is answered by the AI first (reading it into a cart comes with the order module), then the list is offered
    if intent == "order":
        if tapped or not ai_on:
            queue_interactive_message(db, conversation, ORDERING_PROMPT, buttons=[VIEW_PRODUCTS_BUTTON])
            return True
        reply_with_ai(db, conversation, user_text)
        db.refresh(conversation)
        if conversation.status == ConversationStatus.ACTIVE:
            queue_interactive_message(db, conversation, PRODUCT_LIST_OFFER, buttons=[VIEW_PRODUCTS_BUTTON])
        return True

    # Problem: tracked as a ticket from the visit's first message
    if intent == "support":
        if not ai_on:
            hand_over_to_team(db, conversation, user_text, AUTO_REPLY_OFF_CHAT_NOTE, AUTO_REPLY_OFF_TICKET_NOTE)
            return True
        start_ticket_session(db, conversation, visit_first_message_id(db, conversation))
        if tapped:
            queue_outgoing_message(db, conversation, sender="model", content=SUPPORT_PROMPT_TEXT)
            return True
        return False  # They already described it: the AI answers

    # Something else: a question; nothing to track while the AI answers it
    # (with AI auto-reply off the team answers, and team chats are tracked as tickets: reminders, idle close)
    if not ai_on:
        hand_over_to_team(db, conversation, user_text, AUTO_REPLY_OFF_CHAT_NOTE, AUTO_REPLY_OFF_TICKET_NOTE)
        return True
    if tapped:
        queue_outgoing_message(db, conversation, sender="model", content=OTHER_PROMPT_TEXT)
        return True
    return False


def handle_browse_tap(db: Session, conversation: Conversation, reply_id: Optional[str]) -> bool:
    # Category / product menu taps; True = handled (also when ignored: a stale or foreign id gets no reply)
    if not reply_id or not reply_id.startswith((BROWSE_PREFIX, CATEGORY_PREFIX, PRODUCT_PREFIX)):
        return False
    organization_id = conversation.organization_id
    if not is_feature_enabled(db, organization_id, "orders"):
        return False
    if not conversation.intent:
        conversation.intent = "order"
        db.commit()

    # 1. Categories
    if reply_id.startswith(BROWSE_PREFIX):
        send_category_menu(db, conversation, parse_browse_reply(reply_id))
        return True

    # 2. One category's products (a category emptied meanwhile shows the categories again)
    if reply_id.startswith(CATEGORY_PREFIX):
        parsed = parse_category_reply(reply_id)
        menu = product_menu(db, organization_id, parsed[1], parsed[0]) if parsed else None
        if menu:
            queue_interactive_message(db, conversation, menu["body"], menu=menu["menu"])
        else:
            send_category_menu(db, conversation, 0)
        return True

    # 3. A product: its price and stock (the in-chat cart comes next)
    product = tapped_product(db, organization_id, reply_id)
    if product:
        queue_outgoing_message(db, conversation, sender="model", content=product_detail_text(product, workspace_currency(db, organization_id)))
    return True


def send_category_menu(db: Session, conversation: Conversation, page: int):
    menu = category_menu(db, conversation.organization_id, page)
    if menu:
        queue_interactive_message(db, conversation, menu["body"], menu=menu["menu"])
    else:
        queue_outgoing_message(db, conversation, sender="model", content=NO_PRODUCTS_TEXT)


def reply_with_ai(db: Session, conversation: Conversation, user_text: str):
    # Inactive (suspended) workspace: send no AI reply
    org = db.query(Organization).filter(Organization.id == conversation.organization_id).first()
    if not org or org.subscription_status == "inactive" or org.subscription_status != "active":
        print(f"[AI REPLY] Workspace {conversation.organization_id} is inactive (suspended); skipping AI reply")
        return

    # Customer Chats off: the AI assistant is part of it
    if not is_feature_enabled(db, conversation.organization_id, "customer_chats"):
        print(f"[AI REPLY] Customer Chats is off for workspace {conversation.organization_id}; skipping AI reply")
        return

    # AI auto-reply off (AI settings): the team answers, so the chat goes straight to them
    if not ai_auto_reply_on(db, conversation.organization_id):
        hand_over_to_team(db, conversation, user_text, AUTO_REPLY_OFF_CHAT_NOTE, AUTO_REPLY_OFF_TICKET_NOTE)
        return

    # 1. Generate AI reply
    ai_raw_reply = generate_ai_response(db, conversation, user_text)

    # A problem reported: track it as a ticket from the visit's first message (the AI keeps helping)
    if ai_raw_reply and ISSUE_TAG in ai_raw_reply:
        ai_raw_reply = ai_raw_reply.replace(ISSUE_TAG, "").strip()
        start_ticket_session(db, conversation, visit_first_message_id(db, conversation))

    # Empty reply (can't be sent): hand over to the team instead of staying silent
    if not ai_raw_reply or not ai_raw_reply.strip():
        ai_raw_reply = f"{ESCALATION_TAG} {HANDOVER_FALLBACK_TEXT}"

    # 2. Handle Human Handover Detection
    if ESCALATION_TAG in ai_raw_reply:
        # Taken over before the goodbye is queued, so a parallel message can't reach the AI meanwhile
        conversation.status = ConversationStatus.HUMAN_TAKEOVER
        db.commit()

        clean_reply = ai_raw_reply.replace(ESCALATION_TAG, "").strip() or HANDOVER_FALLBACK_TEXT
        queue_outgoing_message(db, conversation, sender="model", content=clean_reply)
        hand_over_to_team(db, conversation, user_text, "The AI handed this chat to the team")
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
