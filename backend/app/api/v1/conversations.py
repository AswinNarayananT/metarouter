from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import math
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus
from app.models.whatsapp_model import WhatsAppNumber
from app.schemas.conversation_schema import SendMessageRequest, UpdateConversationRequest
from app.services.messaging_service import queue_outgoing_message, OutgoingMessageError
from app.services.conversation_service import serialize_conversation, serialize_message, last_customer_message_at, reply_window, handover_roles, as_utc, conversation_payload
from app.realtime.connection_manager import org_group
from app.realtime.events import publish_event

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("/")
def list_conversations(status: Optional[ConversationStatus] = Query(None), search: Optional[str] = Query(None, max_length=100), page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Latest message and latest customer message of every chat
    last_ids = db.query(ChatMessage.conversation_id, func.max(ChatMessage.id).label("last_id")).group_by(ChatMessage.conversation_id).subquery()
    customer_times = db.query(ChatMessage.conversation_id, func.max(ChatMessage.created_at).label("last_customer_at")).filter(ChatMessage.sender == "user").group_by(ChatMessage.conversation_id).subquery()

    # 2. The workspace's chats, most recent activity first
    query = db.query(Conversation, last_ids.c.last_id, customer_times.c.last_customer_at).outerjoin(
        last_ids, last_ids.c.conversation_id == Conversation.id
    ).outerjoin(
        customer_times, customer_times.c.conversation_id == Conversation.id
    ).filter(
        Conversation.organization_id == current_user.organization_id
    )
    if status:
        query = query.filter(Conversation.status == status)
    if search and search.strip():
        query = query.filter(or_(Conversation.customer_phone.ilike(f"%{search.strip()}%"), Conversation.customer_name.ilike(f"%{search.strip()}%")))

    total = query.count()
    rows = query.order_by(last_ids.c.last_id.desc().nullslast(), Conversation.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # 3. Load the last messages and number labels in one query each
    message_ids = [row.last_id for row in rows if row.last_id]
    last_messages = {m.id: m for m in db.query(ChatMessage).options(selectinload(ChatMessage.attachment)).filter(ChatMessage.id.in_(message_ids)).all()} if message_ids else {}
    number_ids = {row.Conversation.phone_number_id for row in rows if row.Conversation.phone_number_id}
    display_numbers = dict(db.query(WhatsAppNumber.phone_number_id, WhatsAppNumber.display_phone_number).filter(WhatsAppNumber.phone_number_id.in_(number_ids)).all()) if number_ids else {}

    return {
        "conversations": [
            serialize_conversation(
                row.Conversation,
                last_messages.get(row.last_id),
                as_utc(row.last_customer_at),
                display_numbers.get(row.Conversation.phone_number_id)
            )
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size))
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


@router.post("/{conversation_id}/messages", status_code=201)
def send_agent_message(conversation_id: int, payload: SendMessageRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Chat of the user's workspace, and a role allowed to reply
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user.role not in handover_roles(db, current_user.organization_id):
        raise HTTPException(status_code=403, detail="Your role can't reply to or take over chats")

    # 2. The business number must still be connected
    number_status: Optional[str] = db.query(WhatsAppNumber.status).filter(WhatsAppNumber.phone_number_id == conversation.phone_number_id).scalar()
    if number_status != "connected":
        raise HTTPException(status_code=409, detail="This chat's WhatsApp number is disconnected. Reconnect it to reply.")

    # 3. Free text only inside the 24-hour window (the send task checks again before sending)
    if not reply_window(last_customer_message_at(db, conversation.id))["window_open"]:
        raise HTTPException(status_code=422, detail="More than 24 hours since the customer's last message. Only a template message can be sent now.")

    # 4. An agent replying takes the chat over, so the AI doesn't answer as well
    if conversation.status != ConversationStatus.HUMAN_TAKEOVER:
        conversation.status = ConversationStatus.HUMAN_TAKEOVER
        db.commit()

    # 5. Save as pending and queue delivery (long text is split into several messages)
    try:
        messages = queue_outgoing_message(db, conversation, sender="human", content=payload.content)
    except OutgoingMessageError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "messages": [serialize_message(m) for m in messages],
        "conversation_status": conversation.status.value
    }


@router.patch("/{conversation_id}")
def update_conversation(conversation_id: int, payload: UpdateConversationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Chat of the user's workspace, and a role allowed to take over
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == current_user.organization_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user.role not in handover_roles(db, current_user.organization_id):
        raise HTTPException(status_code=403, detail="Your role can't reply to or take over chats")

    # 2. human_takeover: AI stays silent; active: AI answers the next customer message
    conversation.status = ConversationStatus(payload.status)
    db.commit()
    db.refresh(conversation)

    # 3. Every open dashboard updates the chat's badge
    conversation_data = conversation_payload(db, conversation)
    publish_event(org_group(conversation.organization_id), "conversation.updated", conversation_data)

    return conversation_data
