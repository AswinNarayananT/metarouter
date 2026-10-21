from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.conversation_model import Conversation, ChatMessage
from app.models.ai_settings_model import OrganizationAISettings
from app.models.whatsapp_model import WhatsAppNumber
from app.models.ticket_model import Ticket
from app.realtime.connection_manager import conversation_group
from app.realtime.events import publish_event

# WhatsApp only allows free-form replies within 24 hours of the customer's last message
CUSTOMER_SERVICE_WINDOW = timedelta(hours=24)
DEFAULT_HANDOVER_ROLES = "admin,manager"

# Same shapes are used by the REST API and the WebSocket events, so the frontend handles one format


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    # Message timestamps are stored without a timezone but are UTC
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def serialize_attachment(attachment) -> Optional[dict]:
    if not attachment:
        return None
    return {
        "id": attachment.id,
        "kind": attachment.kind,
        "mime_type": attachment.mime_type,
        "file_name": attachment.file_name,
        "file_size": attachment.file_size,
        "download_status": attachment.download_status,
        "parse_status": attachment.parse_status,
        "document_type": attachment.document_type,
        "confidence": attachment.confidence,
        "parsed_data": attachment.parsed_data,
        "error": attachment.error
    }


def first_name(name: Optional[str]) -> str:
    # Team members are shown by first name in chats ("Aromal", not "Aromal Raj")
    return (name or "").strip().split(" ")[0] or "A team member"


def serialize_message(message: ChatMessage) -> dict:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender": message.sender,
        "message_type": message.message_type,
        "content": message.content,
        "template_data": message.template_data,
        "status": _enum_value(message.status),
        "error": message.error,
        "created_at": as_utc(message.created_at),
        "attachment": serialize_attachment(message.attachment),
        "sent_by": {"id": message.sent_by.id, "name": first_name(message.sent_by.name)} if message.sent_by else None
    }


def serialize_ad_referral(referral: Optional[dict]) -> Optional[dict]:
    # What the dashboard shows about the ad (the click id and media links stay in the database)
    if not referral:
        return None
    return {
        "headline": referral.get("headline"),
        "body": referral.get("body"),
        "source_type": referral.get("source_type"),
        "source_url": referral.get("source_url")
    }


def last_customer_message_at(db: Session, conversation_id: int) -> Optional[datetime]:
    created_at = db.query(func.max(ChatMessage.created_at)).filter(ChatMessage.conversation_id == conversation_id, ChatMessage.sender == "user").scalar()
    return as_utc(created_at)


def reply_window(last_customer_at: Optional[datetime]) -> dict:
    # When the composer can send free text; after that only templates work
    expires_at = last_customer_at + CUSTOMER_SERVICE_WINDOW if last_customer_at else None
    return {"window_open": bool(expires_at and expires_at > datetime.now(timezone.utc)), "window_expires_at": expires_at}


def serialize_conversation(conversation: Conversation, last_message: Optional[ChatMessage], last_customer_at: Optional[datetime], display_phone_number: Optional[str] = None, open_ticket: Optional[Ticket] = None) -> dict:
    return {
        "id": conversation.id,
        "customer_phone": conversation.customer_phone,
        "customer_name": conversation.customer_name,
        "customer_wa_user_id": conversation.customer_wa_user_id,
        "ad_referral": serialize_ad_referral(conversation.ad_referral),
        "phone_number_id": conversation.phone_number_id,
        "display_phone_number": display_phone_number,
        "status": _enum_value(conversation.status),
        "assigned_to": {"id": conversation.assigned_user.id, "name": conversation.assigned_user.name} if conversation.assigned_user else None,
        "assigned_at": as_utc(conversation.assigned_at),
        "updated_at": as_utc(conversation.updated_at),
        "last_message": serialize_message(last_message) if last_message else None,
        "open_ticket": {"id": open_ticket.id, "number": open_ticket.number, "status": open_ticket.status} if open_ticket else None,
        **reply_window(last_customer_at)
    }


def conversation_payload(db: Session, conversation: Conversation) -> dict:
    # One chat with its last message and number label (detail endpoint and chat list events)
    # Activity entries ("Aromal took this chat") aren't a preview of the conversation
    last_message = db.query(ChatMessage).filter(ChatMessage.conversation_id == conversation.id, ChatMessage.sender != "system").order_by(ChatMessage.id.desc()).first()
    display_phone_number = db.query(WhatsAppNumber.display_phone_number).filter(WhatsAppNumber.phone_number_id == conversation.phone_number_id).scalar()
    open_ticket = db.query(Ticket).filter(Ticket.conversation_id == conversation.id, Ticket.status != "closed").first()
    return serialize_conversation(conversation, last_message, last_customer_message_at(db, conversation.id), display_phone_number, open_ticket)


# Admins and managers supervise: they can assign anyone and reply to any chat
SUPERVISOR_ROLES = {"admin", "manager"}


def can_reply(db: Session, user, conversation: Conversation) -> bool:
    # 1. The owner can always reply (an admin / manager gave them the chat, whatever their role)
    if conversation.assigned_user_id == user.id:
        return True
    # 2. Otherwise the role must be allowed to handle chats (AI settings)
    if user.role not in handover_roles(db, user.organization_id):
        return False
    # 3. Unassigned chats are open to those roles; someone else's chat only to a supervisor stepping in
    return conversation.assigned_user_id is None or user.role in SUPERVISOR_ROLES


def handover_roles(db: Session, organization_id: int) -> set:
    # Roles the admin allowed to take over chats (AI settings); admins always can
    roles = db.query(OrganizationAISettings.allowed_roles_for_handover).filter(OrganizationAISettings.organization_id == organization_id).scalar()
    return {r.strip() for r in (roles or DEFAULT_HANDOVER_ROLES).split(",") if r.strip()} | {"admin"}


def record_activity(db: Session, conversation: Conversation, text: str, user=None) -> ChatMessage:
    # 1. Activity line in the chat timeline (assigned, taken over, handed back ...); never sent to WhatsApp or the AI
    activity = ChatMessage(conversation_id=conversation.id, sender="system", message_type="event", content=text, sent_by_user_id=user.id if user else None)
    db.add(activity)
    db.commit()

    # 2. Show it in the chat right away for everyone who has it open
    publish_event(conversation_group(conversation.id), "message.new", serialize_message(activity))
    return activity
