from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone
import math
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus
from app.models.whatsapp_model import WhatsAppNumber
from app.schemas.conversation_schema import SendMessageRequest, UpdateConversationRequest, AssignConversationRequest
from app.services.messaging_service import queue_outgoing_message, OutgoingMessageError
from app.services.conversation_service import serialize_conversation, serialize_message, last_customer_message_at, reply_window, handover_roles, as_utc, conversation_payload, can_reply, SUPERVISOR_ROLES, record_activity, first_name
from app.realtime.connection_manager import org_group, user_group
from app.realtime.events import publish_event
from app.services.notification_service import notify_assignee

router = APIRouter(prefix="/conversations", tags=["Conversations"])


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

    # 3. Free text only inside the 24-hour window (the send task checks again before sending)
    if not reply_window(last_customer_message_at(db, conversation.id))["window_open"]:
        raise HTTPException(status_code=422, detail="More than 24 hours since the customer's last message. Only a template message can be sent now.")

    # 4. An agent replying takes the chat over (AI goes silent) and owns it if nobody does yet
    if conversation.status != ConversationStatus.HUMAN_TAKEOVER or conversation.assigned_user_id is None:
        was_ai = conversation.status != ConversationStatus.HUMAN_TAKEOVER
        took_chat = conversation.assigned_user_id is None
        conversation.status = ConversationStatus.HUMAN_TAKEOVER
        if took_chat:
            conversation.assigned_user_id = current_user.id
            conversation.assigned_at = datetime.now(timezone.utc)
        db.commit()
        record_activity(db, conversation, f"{first_name(current_user.name)} took over from the AI" if was_ai else f"{first_name(current_user.name)} took this chat", current_user)

    # 5. Save as pending and queue delivery (long text is split into several messages)
    try:
        messages = queue_outgoing_message(db, conversation, sender="human", content=payload.content, sent_by_user_id=current_user.id)
    except OutgoingMessageError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "messages": [serialize_message(m) for m in messages],
        "conversation_status": conversation.status.value,
        "assigned_to": {"id": conversation.assigned_user.id, "name": conversation.assigned_user.name} if conversation.assigned_user else None
    }


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
        else:
            record_activity(db, conversation, f"{first_name(current_user.name)} handed the chat back to the AI", current_user)

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

    # 2. Supervisors assign anyone (any role: the owner can always reply)
    #    Everyone else: take an unassigned chat (if their role may pick up chats) or let go of their own
    is_supervisor = current_user.role in SUPERVISOR_ROLES
    if not is_supervisor:
        taking_free_chat = payload.user_id == current_user.id and conversation.assigned_user_id is None
        releasing_own_chat = payload.user_id is None and conversation.assigned_user_id == current_user.id
        if taking_free_chat and current_user.role not in handover_roles(db, current_user.organization_id):
            raise HTTPException(status_code=403, detail="Your role can't pick up chats. Ask an admin or manager to assign this chat to you.")
        if not taking_free_chat and not releasing_own_chat:
            raise HTTPException(status_code=403, detail="Only admins and managers can assign chats to other members")

    # 3. The new owner must be an active member of this workspace
    assignee = None
    if payload.user_id is not None:
        assignee = db.query(User).filter(
            User.id == payload.user_id,
            User.organization_id == current_user.organization_id
        ).first()

        if not assignee or not assignee.is_active:
            raise HTTPException(status_code=404, detail="Team member not found")


    # Nothing to change (same owner as now)
    previous_user_id = conversation.assigned_user_id
    if (assignee.id if assignee else None) == previous_user_id:
        return conversation_payload(db, conversation)
    previous_owner = conversation.assigned_user

    # 4. Assigning hands the chat to a person, so the AI stays silent
    conversation.assigned_user_id = assignee.id if assignee else None
    conversation.assigned_at = datetime.now(timezone.utc) if assignee else None
    if assignee:
        conversation.status = ConversationStatus.HUMAN_TAKEOVER
    db.commit()
    db.refresh(conversation)

    # 5. Activity line: who did it, from whom, to whom
    actor = first_name(current_user.name)
    if assignee and assignee.id == current_user.id:
        text = f"{actor} took this chat from {first_name(previous_owner.name)}" if previous_owner else f"{actor} took this chat"
    elif assignee and previous_owner and previous_owner.id == current_user.id:
        text = f"{actor} handed this chat to {first_name(assignee.name)}"
    elif assignee:
        text = f"{actor} reassigned this chat from {first_name(previous_owner.name)} to {first_name(assignee.name)}" if previous_owner else f"{actor} assigned this chat to {first_name(assignee.name)}"
    elif previous_owner and previous_owner.id == current_user.id:
        text = f"{actor} unassigned themselves"
    else:
        text = f"{actor} unassigned {first_name(previous_owner.name)}"
    record_activity(db, conversation, text, current_user)

    # 6. Every dashboard updates the owner; the new owner gets a personal alert (not when assigning yourself)
    conversation_data = conversation_payload(db, conversation)
    publish_event(org_group(conversation.organization_id), "conversation.updated", conversation_data)
    if assignee and assignee.id != current_user.id and assignee.id != previous_user_id:
        publish_event(user_group(assignee.id), "conversation.assigned", {**conversation_data, "assigned_by": {"id": current_user.id, "name": current_user.name}})
        last_customer_text = db.query(ChatMessage.content).filter(ChatMessage.conversation_id == conversation.id, ChatMessage.sender == "user").order_by(ChatMessage.id.desc()).limit(1).scalar()
        notify_assignee(db, conversation, assignee, current_user, last_customer_text)

    return conversation_data
