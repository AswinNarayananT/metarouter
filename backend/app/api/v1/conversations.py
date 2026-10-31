from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from typing import Optional
from datetime import datetime, timezone
import math
import os
import uuid
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus, MessageStatus, ConversationRead
from app.models.whatsapp_model import WhatsAppNumber
from app.models.ticket_model import Ticket
from app.models.attachment_model import ChatAttachment
from app.config import settings
from app.schemas.conversation_schema import SendMessageRequest, UpdateConversationRequest, AssignConversationRequest, SendTemplateRequest
from app.services.messaging_service import queue_outgoing_message, OutgoingMessageError
from app.services.conversation_service import serialize_conversation, serialize_message, last_customer_message_at, reply_window, as_utc, conversation_payload, can_reply, record_activity, first_name, ai_auto_reply_on, AI_AUTO_REPLY_OFF_ERROR
from app.realtime.connection_manager import org_group, user_group
from app.realtime.events import publish_event
from app.services.assignment_service import check_assign_permission, assign_owner
from app.services.ticket_service import get_open_ticket, escalate_ticket, sync_ticket_owner, mark_ticket_in_progress, hand_ticket_back_to_ai
from app.services.whatsapp_service import get_message_templates, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError
from app.services.broadcast_service import summarize_template, render_body
from app.services.channel_service import mark_number_disconnected, NUMBER_DISCONNECTED_ERROR
from app.realtime.notify import notify_new_messages
from app.workers.tasks.whatsapp_tasks import send_whatsapp_message_task
from app.core.features import require_feature

router = APIRouter(
    prefix="/conversations",
    tags=["Conversations"],
    dependencies=[Depends(require_feature("customer_chats"))]
)

# Sent when an agent hands the chat back: the AI closes the ticket once the customer needs nothing else
ANYTHING_ELSE_TEXT = "Is there anything else I can help you with?"

# Files agents can send, with WhatsApp's size limits (images 5 MB; documents capped at our download limit)
SENDABLE_FILES = {
    "image/jpeg": ("image", ".jpg"),
    "image/png": ("image", ".png"),
    "application/pdf": ("document", ".pdf"),
    "application/msword": ("document", ".doc"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ("document", ".docx"),
    "application/vnd.ms-excel": ("document", ".xls"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ("document", ".xlsx"),
    "application/vnd.ms-powerpoint": ("document", ".ppt"),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ("document", ".pptx"),
    "text/plain": ("document", ".txt"),
    "text/csv": ("document", ".csv"),
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.get("/")
def list_conversations(status: Optional[ConversationStatus] = Query(None), assigned: Optional[str] = Query(None, pattern="^(me|unassigned)$"), search: Optional[str] = Query(None, max_length=100), page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Latest message and latest customer message of every chat
    last_ids = db.query(ChatMessage.conversation_id, func.max(ChatMessage.id).label("last_id")).filter(ChatMessage.sender != "system").group_by(ChatMessage.conversation_id).subquery()
    customer_times = db.query(ChatMessage.conversation_id, func.max(ChatMessage.created_at).label("last_customer_at")).filter(ChatMessage.sender == "user").group_by(ChatMessage.conversation_id).subquery()

    # 2. The workspace's chats, most recent activity first
    query = db.query(Conversation, last_ids.c.last_id, customer_times.c.last_customer_at).options(selectinload(Conversation.assigned_user)).outerjoin(
        last_ids, last_ids.c.conversation_id == Conversation.id
    ).outerjoin(
        customer_times, customer_times.c.conversation_id == Conversation.id
    ).filter(
        Conversation.organization_id == current_user.organization_id
    )
    if status:
        query = query.filter(Conversation.status == status)
    # Mine = assigned to the current user; unassigned = waiting for someone in the team
    if assigned == "me":
        query = query.filter(Conversation.assigned_user_id == current_user.id)
    elif assigned == "unassigned":
        query = query.filter(Conversation.assigned_user_id.is_(None))
    if search and search.strip():
        query = query.filter(or_(Conversation.customer_phone.ilike(f"%{search.strip()}%"), Conversation.customer_name.ilike(f"%{search.strip()}%")))

    total = query.count()
    rows = query.order_by(last_ids.c.last_id.desc().nullslast(), Conversation.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # 3. Load the last messages and number labels in one query each
    message_ids = [row.last_id for row in rows if row.last_id]
    last_messages = {m.id: m for m in db.query(ChatMessage).options(selectinload(ChatMessage.attachment)).filter(ChatMessage.id.in_(message_ids)).all()} if message_ids else {}
    number_ids = {row.Conversation.phone_number_id for row in rows if row.Conversation.phone_number_id}
    display_numbers = dict(db.query(WhatsAppNumber.phone_number_id, WhatsAppNumber.display_phone_number).filter(WhatsAppNumber.phone_number_id.in_(number_ids)).all()) if number_ids else {}
    conversation_ids = [row.Conversation.id for row in rows]
    open_tickets = {t.conversation_id: t for t in db.query(Ticket).filter(Ticket.conversation_id.in_(conversation_ids), Ticket.status != "closed").all()} if conversation_ids else {}

    # 4. This user's unread customer messages per chat (newer than their read marker), one query for the page
    unread_counts = dict(db.query(ChatMessage.conversation_id, func.count(ChatMessage.id)).outerjoin(
        ConversationRead, (ConversationRead.conversation_id == ChatMessage.conversation_id) & (ConversationRead.user_id == current_user.id)
    ).filter(
        ChatMessage.conversation_id.in_(conversation_ids),
        ChatMessage.sender == "user",
        ChatMessage.id > func.coalesce(ConversationRead.last_read_message_id, 0)
    ).group_by(ChatMessage.conversation_id).all()) if conversation_ids else {}

    return {
        "conversations": [
            {
                **serialize_conversation(
                    row.Conversation,
                    last_messages.get(row.last_id),
                    as_utc(row.last_customer_at),
                    display_numbers.get(row.Conversation.phone_number_id),
                    open_tickets.get(row.Conversation.id)
                ),
                "unread_count": unread_counts.get(row.Conversation.id, 0)
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size))
    }


@router.get("/counts")
def conversation_counts(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Numbers on the chat list tabs (the list itself loads 30 at a time, so it can't count them)
    base = db.query(Conversation.id).filter(Conversation.organization_id == current_user.organization_id)

    return {
        "all": base.count(),
        "mine": base.filter(Conversation.assigned_user_id == current_user.id).count(),
        "unassigned": base.filter(Conversation.status == ConversationStatus.HUMAN_TAKEOVER, Conversation.assigned_user_id.is_(None)).count(),
        "ai": base.filter(Conversation.status == ConversationStatus.ACTIVE).count()
    }


@router.get("/{conversation_id}")
def get_conversation(conversation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Only chats of the user's own workspace
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation_payload(db, conversation)


@router.post("/{conversation_id}/read")
def mark_conversation_read(conversation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Only chats of the user's own workspace
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 2. Move the user's marker to the newest message (one row per user and chat; never moves back)
    last_id = db.query(func.max(ChatMessage.id)).filter(ChatMessage.conversation_id == conversation_id).scalar() or 0
    db.execute(pg_insert(ConversationRead).values(user_id=current_user.id, conversation_id=conversation_id, last_read_message_id=last_id).on_conflict_do_update(
        constraint="uq_conversation_read_user_conversation",
        set_={"last_read_message_id": func.greatest(ConversationRead.last_read_message_id, last_id), "updated_at": func.now()}
    ))
    db.commit()

    # 3. The user's other tabs clear the badge too
    publish_event(user_group(current_user.id), "conversation.read", {"conversation_id": conversation_id})

    return {
        "conversation_id": conversation_id,
        "last_read_message_id": last_id
    }


@router.get("/{conversation_id}/messages")
def list_messages(conversation_id: int, before_id: Optional[int] = Query(None, ge=1), limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Only chats of the user's own workspace
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 2. Newest page first (scrolling up passes before_id = oldest id already shown)
    query = db.query(ChatMessage).options(selectinload(ChatMessage.attachment)).filter(ChatMessage.conversation_id == conversation_id)
    if before_id:
        query = query.filter(ChatMessage.id < before_id)
    rows = query.order_by(ChatMessage.id.desc()).limit(limit + 1).all()

    # 3. One extra row tells whether older messages exist; return oldest -> newest for display
    has_more = len(rows) > limit
    messages = list(reversed(rows[:limit]))

    return {
        "messages": [serialize_message(m) for m in messages],
        "has_more": has_more,
        "next_before_id": messages[0].id if has_more and messages else None
    }


def _chat_for_reply(db: Session, conversation_id: int, current_user: User, need_window: bool) -> Conversation:
    # 1. Chat of the user's workspace, and allowed to reply (role, and the owner or a supervisor)
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not can_reply(db, current_user, conversation):
        if conversation.assigned_user_id and conversation.assigned_user_id != current_user.id:
            raise HTTPException(status_code=403, detail=f"This chat is assigned to {conversation.assigned_user.name}. Ask them or a manager to reassign it.")
        raise HTTPException(status_code=403, detail="Your role can't pick up chats. Ask an admin or manager to assign this chat to you.")

    # 2. The business number must still be connected
    number_status: Optional[str] = db.query(WhatsAppNumber.status).filter(WhatsAppNumber.phone_number_id == conversation.phone_number_id).scalar()
    if number_status != "connected":
        raise HTTPException(status_code=409, detail="This chat's WhatsApp number is disconnected. Reconnect it to reply.")

    # 3. Free text and files only inside the 24-hour window (templates work any time; the send task checks again)
    if need_window and not reply_window(last_customer_message_at(db, conversation.id))["window_open"]:
        raise HTTPException(status_code=422, detail="More than 24 hours since the customer's last message. Only a template message can be sent now.")

    return conversation


def _take_chat_for_reply(db: Session, conversation: Conversation, current_user: User):
    # An agent replying takes the chat over (AI goes silent) and owns it if nobody does yet
    if conversation.status == ConversationStatus.HUMAN_TAKEOVER and conversation.assigned_user_id is not None:
        return
    was_ai = conversation.status != ConversationStatus.HUMAN_TAKEOVER
    conversation.status = ConversationStatus.HUMAN_TAKEOVER
    if conversation.assigned_user_id is None:
        conversation.assigned_user_id = current_user.id
        conversation.assigned_at = datetime.now(timezone.utc)
    db.commit()
    record_activity(db, conversation, f"{first_name(current_user.name)} took over from the AI" if was_ai else f"{first_name(current_user.name)} took this chat", current_user)


def _after_reply(db: Session, conversation: Conversation, current_user: User, messages: list) -> dict:
    # Ticket: a team ticket, owned like the chat, now in progress (opened now if the AI chat had none, e.g. a plain question)
    ticket = get_open_ticket(db, conversation.id)
    if not ticket or ticket.status == "ai_handling":
        escalate_ticket(db, conversation, current_user)
    sync_ticket_owner(db, conversation, current_user)
    mark_ticket_in_progress(db, conversation, current_user)

    return {
        "messages": [serialize_message(m) for m in messages],
        "conversation_status": conversation.status.value,
        "assigned_to": {"id": conversation.assigned_user.id, "name": conversation.assigned_user.name} if conversation.assigned_user else None
    }


def _queue_single_message(db: Session, message: ChatMessage) -> ChatMessage:
    # Files and templates are one message each (text goes through queue_outgoing_message, which splits long text)
    db.add(message)
    db.commit()
    db.refresh(message)
    notify_new_messages(db, [message])
    send_whatsapp_message_task.delay(message.id)
    return message


@router.post("/{conversation_id}/messages", status_code=201)
def send_agent_message(conversation_id: int, payload: SendMessageRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Allowed to reply right now, and the chat becomes the agent's
    conversation = _chat_for_reply(db, conversation_id, current_user, need_window=True)
    _take_chat_for_reply(db, conversation, current_user)

    # 2. Save as pending and queue delivery (long text is split into several messages)
    try:
        messages = queue_outgoing_message(db, conversation, sender="human", content=payload.content, sent_by_user_id=current_user.id)
    except OutgoingMessageError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return _after_reply(db, conversation, current_user, messages)


@router.post("/{conversation_id}/attachments", status_code=201)
async def send_agent_attachment(conversation_id: int, file: UploadFile = File(...), caption: Optional[str] = Form(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Allowed to reply right now (files count as free-form messages: 24-hour window)
    conversation = _chat_for_reply(db, conversation_id, current_user, need_window=True)

    # 2. A type and size WhatsApp accepts
    mime_type = (file.content_type or "").split(";")[0].strip().lower()
    if mime_type not in SENDABLE_FILES:
        raise HTTPException(status_code=422, detail="This file type can't be sent on WhatsApp. Send an image (JPG, PNG) or a document (PDF, Word, Excel, PowerPoint, TXT, CSV).")
    kind, extension = SENDABLE_FILES[mime_type]
    content = await file.read(settings.MEDIA_MAX_DOWNLOAD_BYTES + 1)
    max_bytes = MAX_IMAGE_BYTES if kind == "image" else settings.MEDIA_MAX_DOWNLOAD_BYTES
    if not content:
        raise HTTPException(status_code=422, detail="The file is empty")
    if len(content) > max_bytes:
        raise HTTPException(status_code=422, detail=f"{'Images' if kind == 'image' else 'Documents'} can be at most {max_bytes // (1024 * 1024)} MB on WhatsApp")

    # 3. Store it like customer files: org_<id>/<yyyy>/<mm>/<random name><ext> (never the uploaded name)
    now = datetime.now(timezone.utc)
    relative_path = os.path.join(f"org_{conversation.organization_id}", now.strftime("%Y"), now.strftime("%m"), f"{uuid.uuid4().hex}{extension}")
    full_path = os.path.join(settings.MEDIA_STORAGE_PATH, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path + ".part", "wb") as f:
        f.write(content)
    os.replace(full_path + ".part", full_path)

    # 4. The chat becomes the agent's; save the message + file and queue the send (uploaded to Meta by the task)
    _take_chat_for_reply(db, conversation, current_user)
    file_name = os.path.basename(file.filename or f"file{extension}")[:255]
    caption = (caption or "").strip()[:1024]
    message = ChatMessage(
        conversation_id=conversation.id,
        sender="human",
        message_type=kind,
        content=caption or f"[Sent {'an image' if kind == 'image' else 'a document'}: {file_name}]",
        status=MessageStatus.PENDING,
        sent_by_user_id=current_user.id
    )
    message.attachment = ChatAttachment(
        organization_id=conversation.organization_id,
        media_id="",  # Filled with Meta's id when the send task uploads it
        kind=kind,
        mime_type=mime_type,
        file_name=file_name,
        file_size=len(content),
        storage_path=relative_path,
        download_status="done",
        parse_status="skipped"
    )
    message = _queue_single_message(db, message)

    return _after_reply(db, conversation, current_user, [message])


@router.get("/{conversation_id}/templates")
def list_chat_templates(conversation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Approved templates of the chat's business number (anyone who can reply may use them)
    conversation = _chat_for_reply(db, conversation_id, current_user, need_window=False)
    number = db.query(WhatsAppNumber).filter(WhatsAppNumber.phone_number_id == conversation.phone_number_id).first()

    try:
        templates = get_message_templates(number.waba_id, number.access_token)
    except WhatsAppTokenError as exc:
        mark_number_disconnected(db, number, exc)
        raise HTTPException(status_code=400, detail=NUMBER_DISCONNECTED_ERROR)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not load templates from WhatsApp: {exc}")

    return {
        "templates": [summarize_template(t) for t in templates]
    }


@router.post("/{conversation_id}/template", status_code=201)
def send_agent_template(conversation_id: int, payload: SendTemplateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Allowed to reply (templates work outside the 24-hour window)
    conversation = _chat_for_reply(db, conversation_id, current_user, need_window=False)
    number = db.query(WhatsAppNumber).filter(WhatsAppNumber.phone_number_id == conversation.phone_number_id).first()

    # 2. The template must exist, be approved and supported, with a value for every variable
    try:
        templates = get_message_templates(number.waba_id, number.access_token)
    except WhatsAppTokenError as exc:
        mark_number_disconnected(db, number, exc)
        raise HTTPException(status_code=400, detail=NUMBER_DISCONNECTED_ERROR)
    except (WhatsAppRetryableError, WhatsAppPermanentError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not load templates from WhatsApp: {exc}")

    template = next((summarize_template(t) for t in templates if t.get("name") == payload.template_name and t.get("language") == payload.language), None)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not approved")
    if not template["supported"]:
        raise HTTPException(status_code=422, detail=template["unsupported_reason"])
    parameters = [p.strip() for p in payload.parameters]
    if len(parameters) != template["variable_count"] or any(not p for p in parameters):
        raise HTTPException(status_code=422, detail=f"This template needs {template['variable_count']} value(s), one for each {{{{n}}}}")

    # 3. The chat becomes the agent's; save and queue the template (the customer's reply reopens the window)
    _take_chat_for_reply(db, conversation, current_user)
    message = ChatMessage(
        conversation_id=conversation.id,
        sender="human",
        message_type="template",
        content=render_body(template["body_text"], parameters) or f"[Template: {template['name']}]",
        template_data={"name": template["name"], "language": template["language"], "parameters": parameters},
        status=MessageStatus.PENDING,
        sent_by_user_id=current_user.id
    )
    message = _queue_single_message(db, message)

    return _after_reply(db, conversation, current_user, [message])


@router.patch("/{conversation_id}")
def update_conversation(conversation_id: int, payload: UpdateConversationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Chat of the user's workspace, and allowed to handle it (role, and the owner or a supervisor)
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not can_reply(db, current_user, conversation):
        if conversation.assigned_user_id and conversation.assigned_user_id != current_user.id:
            raise HTTPException(status_code=403, detail=f"This chat is assigned to {conversation.assigned_user.name}. Ask them or a manager to reassign it.")
        raise HTTPException(status_code=403, detail="Your role can't pick up chats. Ask an admin or manager to assign this chat to you.")

    # AI auto-reply off: nobody to hand the chat back to
    if payload.status == ConversationStatus.ACTIVE.value and not ai_auto_reply_on(db, conversation.organization_id):
        raise HTTPException(status_code=409, detail=AI_AUTO_REPLY_OFF_ERROR)

    # 2. human_takeover: AI stays silent and the chat is yours if nobody owns it
    #    active: AI answers the next customer message, so nobody owns it anymore
    previous_status = conversation.status
    conversation.status = ConversationStatus(payload.status)
    if conversation.status == ConversationStatus.HUMAN_TAKEOVER and conversation.assigned_user_id is None:
        conversation.assigned_user_id = current_user.id
        conversation.assigned_at = datetime.now(timezone.utc)
    elif conversation.status == ConversationStatus.ACTIVE:
        conversation.assigned_user_id = None
        conversation.assigned_at = None
    db.commit()
    db.refresh(conversation)

    # Activity line in the chat (only when something actually changed)
    if conversation.status != previous_status:
        if conversation.status == ConversationStatus.HUMAN_TAKEOVER:
            record_activity(db, conversation, f"{first_name(current_user.name)} took over from the AI", current_user)
            escalate_ticket(db, conversation, current_user)
            sync_ticket_owner(db, conversation, current_user)
        else:
            record_activity(db, conversation, f"{first_name(current_user.name)} handed the chat back to the AI", current_user)

            # The AI finishes the ticket: asks "anything else?" and closes it when the customer says no
            if hand_ticket_back_to_ai(db, conversation, current_user):
                number_status: Optional[str] = db.query(WhatsAppNumber.status).filter(WhatsAppNumber.phone_number_id == conversation.phone_number_id).scalar()
                if number_status == "connected":
                    queue_outgoing_message(db, conversation, sender="model", content=ANYTHING_ELSE_TEXT)

    # 3. Every open dashboard updates the chat's badge
    conversation_data = conversation_payload(db, conversation)
    publish_event(org_group(conversation.organization_id), "conversation.updated", conversation_data)

    return conversation_data


@router.patch("/{conversation_id}/assign")
def assign_conversation(conversation_id: int, payload: AssignConversationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Chat of the user's workspace
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 2. Allowed to assign, then give the chat (and its open ticket) to the new owner
    check_assign_permission(db, current_user, conversation, payload.user_id)
    return assign_owner(db, conversation, payload.user_id, current_user)
