from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.models.organization_model import User
from app.models.notification_model import Notification
from app.services.notification_service import serialize_notification
from app.realtime.connection_manager import user_group
from app.realtime.events import publish_event

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class MarkNotificationsReadRequest(BaseModel):
    # Only this chat's / ticket's notifications (opening it); both empty = mark everything read
    conversation_id: Optional[int] = None
    ticket_id: Optional[int] = None


def _unread_count(db: Session, user_id: int) -> int:
    return db.query(Notification.id).filter(Notification.user_id == user_id, Notification.read_at.is_(None)).count()


@router.get("/")
def list_notifications(limit: int = Query(15, ge=1, le=50), before_id: Optional[int] = Query(None, ge=1), unread_only: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. The user's notifications, newest first (Unread tab = only unread ones)
    query = db.query(Notification).options(selectinload(Notification.actor), selectinload(Notification.ticket)).filter(
        Notification.user_id == current_user.id
    )
    if unread_only:
        query = query.filter(Notification.read_at.is_(None))

    # 2. Next page = older than the last one loaded (ids, not page numbers: new ones keep arriving live)
    if before_id is not None:
        query = query.filter(Notification.id < before_id)

    # 3. One extra row tells whether there are more to load
    notifications = query.order_by(Notification.id.desc()).limit(limit + 1).all()

    return {
        "notifications": [serialize_notification(n) for n in notifications[:limit]],
        "has_more": len(notifications) > limit,
        "unread_count": _unread_count(db, current_user.id)
    }


@router.patch("/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Only the user's own notifications
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()

    # 2. The user's other tabs update their badge too
    unread_count = _unread_count(db, current_user.id)
    publish_event(user_group(current_user.id), "notifications.read", {"ids": [notification.id], "conversation_id": None, "unread_count": unread_count})

    return {
        "notification": serialize_notification(notification),
        "unread_count": unread_count
    }


@router.post("/read")
def mark_notifications_read(payload: MarkNotificationsReadRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Unread notifications of the user (optionally only one chat's)
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read_at.is_(None)
    )
    if payload.conversation_id is not None:
        query = query.filter(Notification.conversation_id == payload.conversation_id)
    if payload.ticket_id is not None:
        query = query.filter(Notification.ticket_id == payload.ticket_id)

    notifications = query.all()
    now = datetime.now(timezone.utc)
    for notification in notifications:
        notification.read_at = now
    if notifications:
        db.commit()

    # 2. The user's other tabs update their badge too
    unread_count = _unread_count(db, current_user.id)
    if notifications:
        publish_event(user_group(current_user.id), "notifications.read", {"ids": [n.id for n in notifications], "conversation_id": payload.conversation_id, "unread_count": unread_count})

    return {
        "marked": len(notifications),
        "unread_count": unread_count
    }
