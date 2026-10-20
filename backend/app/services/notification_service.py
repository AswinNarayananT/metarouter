from typing import Optional
from sqlalchemy.orm import Session
from app.models.organization_model import User
from app.models.conversation_model import Conversation
from app.models.notification_model import Notification
from app.realtime.connection_manager import user_group
from app.realtime.events import publish_event
from app.services.conversation_service import as_utc, first_name, handover_roles, SUPERVISOR_ROLES

PREVIEW_CHARS = 120  # Customer message shown under the title


def serialize_notification(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "conversation_id": notification.conversation_id,
        "actor": {"id": notification.actor.id, "name": first_name(notification.actor.name)} if notification.actor else None,
        "read_at": as_utc(notification.read_at),
        "created_at": as_utc(notification.created_at)
    }


def conversation_summary(conversation: Conversation, preview: Optional[str]) -> str:
    # "Aswin_nt · I want to talk to a real person"
    customer = conversation.customer_name or f"+{conversation.customer_phone}"
    if not preview:
        return customer
    preview = preview.strip().replace("\n", " ")
    return f"{customer} · {preview[:PREVIEW_CHARS]}{'…' if len(preview) > PREVIEW_CHARS else ''}"


def create_notifications(db: Session, conversation: Conversation, user_ids: list, type: str, title: str, body: Optional[str], actor_user_id: Optional[int] = None) -> list:
    # 1. One row per recipient, so each person has their own read / unread state
    notifications = [
        Notification(organization_id=conversation.organization_id, user_id=user_id, type=type, title=title, body=body, conversation_id=conversation.id, actor_user_id=actor_user_id)
        for user_id in dict.fromkeys(user_ids)
    ]
    if not notifications:
        return []
    db.add_all(notifications)
    db.commit()

    # 2. Straight to each recipient's open tabs (bell badge + list)
    for notification in notifications:
        db.refresh(notification)
        publish_event(user_group(notification.user_id), "notification.new", serialize_notification(notification))
    return notifications


def notify_team_of_handover(db: Session, conversation: Conversation, preview: Optional[str]) -> list:
    # Everyone who can act on an unassigned chat: admins, managers and roles allowed to pick up chats
    roles = handover_roles(db, conversation.organization_id) | SUPERVISOR_ROLES
    recipients = db.query(User.id).filter(
        User.organization_id == conversation.organization_id,
        User.is_active == True,
        User.role.in_(roles)
    ).all()
    return create_notifications(db, conversation, [r.id for r in recipients], "handover", "A customer needs a human", conversation_summary(conversation, preview))


def notify_assignee(db: Session, conversation: Conversation, assignee: User, actor: User, preview: Optional[str]) -> list:
    # Only the new owner, and never for assigning yourself
    if assignee.id == actor.id:
        return []
    return create_notifications(db, conversation, [assignee.id], "assigned", f"{first_name(actor.name)} assigned you a chat", conversation_summary(conversation, preview), actor.id)
