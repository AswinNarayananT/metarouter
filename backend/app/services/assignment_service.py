from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.organization_model import User
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus
from app.realtime.connection_manager import org_group, user_group
from app.realtime.events import publish_event
from app.services.conversation_service import conversation_payload, record_activity, first_name, handover_roles, SUPERVISOR_ROLES
from app.services.notification_service import notify_assignee
from app.services.ticket_service import get_open_ticket, escalate_ticket, sync_ticket_owner

# One owner for the customer: assigning the chat assigns its open ticket and the other way round.
# Used by PATCH /conversations/{id}/assign and PATCH /tickets/{id}/assign.


def check_assign_permission(db: Session, actor: User, conversation: Conversation, user_id: Optional[int]):
    # Supervisors assign anyone; everyone else can take an unassigned chat (if their role may) or let go of their own
    if actor.role in SUPERVISOR_ROLES:
        return
    taking_free_chat = user_id == actor.id and conversation.assigned_user_id is None
    releasing_own_chat = user_id is None and conversation.assigned_user_id == actor.id
    if taking_free_chat and actor.role not in handover_roles(db, actor.organization_id):
        raise HTTPException(status_code=403, detail="Your role can't pick up chats. Ask an admin or manager to assign this chat to you.")
    if not taking_free_chat and not releasing_own_chat:
        raise HTTPException(status_code=403, detail="Only admins and managers can assign chats to other members")


def assign_owner(db: Session, conversation: Conversation, user_id: Optional[int], actor: User, ticket_number: Optional[int] = None) -> dict:
    # 1. The new owner must be an active member of this workspace
    assignee = None
    if user_id is not None:
        assignee = db.query(User).filter(
            User.id == user_id,
            User.organization_id == actor.organization_id
        ).first()

        if not assignee or not assignee.is_active:
            raise HTTPException(status_code=404, detail="Team member not found")

    # Nothing to change (same owner as now)
    previous_user_id = conversation.assigned_user_id
    if (assignee.id if assignee else None) == previous_user_id:
        return conversation_payload(db, conversation)
    previous_owner = conversation.assigned_user

    # 2. Assigning hands the chat to a person, so the AI stays silent
    conversation.assigned_user_id = assignee.id if assignee else None
    conversation.assigned_at = datetime.now(timezone.utc) if assignee else None
    if assignee:
        conversation.status = ConversationStatus.HUMAN_TAKEOVER
    db.commit()
    db.refresh(conversation)

    # 3. Activity line: who did it, from whom, to whom
    name = first_name(actor.name)
    if assignee and assignee.id == actor.id:
        text = f"{name} took this chat from {first_name(previous_owner.name)}" if previous_owner else f"{name} took this chat"
    elif assignee and previous_owner and previous_owner.id == actor.id:
        text = f"{name} handed this chat to {first_name(assignee.name)}"
    elif assignee:
        text = f"{name} reassigned this chat from {first_name(previous_owner.name)} to {first_name(assignee.name)}" if previous_owner else f"{name} assigned this chat to {first_name(assignee.name)}"
    elif previous_owner and previous_owner.id == actor.id:
        text = f"{name} unassigned themselves"
    else:
        text = f"{name} unassigned {first_name(previous_owner.name)}"
    record_activity(db, conversation, text, actor)

    # 4. The open ticket follows: assigning to a person makes it a team ticket, owned like the chat
    ticket = get_open_ticket(db, conversation.id)
    if assignee and ticket and ticket.status == "ai_handling":
        escalate_ticket(db, conversation, actor)
    sync_ticket_owner(db, conversation, actor)

    # 5. Every dashboard updates the owner; the new owner gets a personal alert (not when assigning yourself)
    conversation_data = conversation_payload(db, conversation)
    publish_event(org_group(conversation.organization_id), "conversation.updated", conversation_data)
    if assignee and assignee.id != actor.id:
        publish_event(user_group(assignee.id), "conversation.assigned", {**conversation_data, "assigned_by": {"id": actor.id, "name": actor.name}})
        last_customer_text = db.query(ChatMessage.content).filter(ChatMessage.conversation_id == conversation.id, ChatMessage.sender == "user").order_by(ChatMessage.id.desc()).limit(1).scalar()
        title = f"{first_name(actor.name)} assigned you ticket #{ticket_number}" if ticket_number else None
        notify_assignee(db, conversation, assignee, actor, last_customer_text, title)

    return conversation_data
