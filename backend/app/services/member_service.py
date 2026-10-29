from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.organization_model import User
from app.models.conversation_model import Conversation
from app.models.ticket_model import Ticket
from app.realtime.connection_manager import user_group
from app.realtime.events import publish_event
from app.services.assignment_service import assign_owner
from app.services.conversation_service import first_name
from app.services.ticket_service import OPEN_STATUSES, add_ticket_activity, publish_ticket

# A member leaves the workspace: removed by an admin, or left themselves. Their row is kept (history keeps
# their name), the email is free for another workspace, and an admin can restore them later.
# Used by POST /organizations/members/{id}/remove and POST /organizations/members/me/leave.

MEMBER_LEFT_MESSAGE = "You left the workspace. An admin can add you back if you need access again."


def assigned_chats_query(db: Session, member: User):
    return db.query(Conversation).filter(Conversation.organization_id == member.organization_id, Conversation.assigned_user_id == member.id)


def assigned_tickets_query(db: Session, member: User):
    return db.query(Ticket).filter(Ticket.organization_id == member.organization_id, Ticket.assigned_user_id == member.id, Ticket.status.in_(OPEN_STATUSES))


def other_active_admins(db: Session, member: User) -> int:
    return db.query(User.id).filter(
        User.organization_id == member.organization_id,
        User.role == "admin",
        User.is_active == True,
        User.removed_at == None,
        User.id != member.id
    ).count()


def archive_member(db: Session, member: User, actor: User, new_owner: Optional[User], removal_type: str, message: str) -> int:
    # 1. Hand over their chats (each open ticket follows its chat), then any ticket left over
    chats = assigned_chats_query(db, member).all()
    for conversation in chats:
        assign_owner(db, conversation, new_owner.id if new_owner else None, actor)

    for ticket in assigned_tickets_query(db, member).all():
        ticket.assigned_user_id = new_owner.id if new_owner else None
        db.commit()
        db.refresh(ticket)
        add_ticket_activity(db, ticket, "assigned", f"Assigned to {first_name(new_owner.name)}" if new_owner else "Unassigned", actor)
        publish_ticket(ticket)

    # 2. Archive the account: history keeps their name, the email is free, every session ends
    now = datetime.now(timezone.utc)
    member.is_active = False
    member.removed_at = now
    member.removal_type = removal_type
    member.tokens_valid_after = now
    db.commit()
    db.refresh(member)

    # 3. Their open tabs go to the login page and stop getting live events
    publish_event(user_group(member.id), "member.removed", {"message": message, "reason": removal_type})

    return len(chats)
