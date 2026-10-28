from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_workspace_user
from app.core.features import require_feature
from app.models.organization_model import User
from app.models.quick_reply_model import QuickReply
from app.schemas.quick_reply_schema import QuickReplyCreate, QuickReplyUpdate
from app.services.conversation_service import SUPERVISOR_ROLES

router = APIRouter(
    prefix="/quick-replies",
    tags=["Quick Replies"],
    dependencies=[Depends(require_feature("customer_chats"))]
)

MAX_REPLIES_PER_LIST = 200  # Shared list per workspace, personal list per member


def _serialize(reply: QuickReply, user: User) -> dict:
    shared = reply.owner_user_id is None
    return {
        "id": reply.id,
        "shortcut": reply.shortcut,
        "content": reply.content,
        "scope": "shared" if shared else "personal",
        "can_edit": user.role in SUPERVISOR_ROLES if shared else reply.owner_user_id == user.id
    }


def _shortcut_taken(db: Session, user: User, shortcut: str, shared: bool, exclude_id: int = None) -> bool:
    query = db.query(QuickReply.id).filter(QuickReply.organization_id == user.organization_id, QuickReply.shortcut == shortcut)
    query = query.filter(QuickReply.owner_user_id.is_(None)) if shared else query.filter(QuickReply.owner_user_id == user.id)
    if exclude_id:
        query = query.filter(QuickReply.id != exclude_id)
    return query.first() is not None


def _editable_reply(db: Session, reply_id: int, user: User) -> QuickReply:
    # 1. Strictly within this workspace; someone else's personal reply looks like it doesn't exist
    reply = db.query(QuickReply).filter(
        QuickReply.id == reply_id,
        QuickReply.organization_id == user.organization_id,
        or_(QuickReply.owner_user_id.is_(None), QuickReply.owner_user_id == user.id)
    ).first()

    if not reply:
        raise HTTPException(status_code=404, detail="Quick reply not found")

    # 2. The shared list is kept by admins and managers
    if reply.owner_user_id is None and user.role not in SUPERVISOR_ROLES:
        raise HTTPException(status_code=403, detail="Only admins and managers can change shared quick replies")
    return reply


@router.get("")
def list_quick_replies(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # The team's shared replies plus this member's own
    replies = db.query(QuickReply).filter(
        QuickReply.organization_id == current_user.organization_id,
        or_(QuickReply.owner_user_id.is_(None), QuickReply.owner_user_id == current_user.id)
    ).order_by(QuickReply.shortcut, QuickReply.owner_user_id.nullsfirst()).all()

    return {
        "quick_replies": [_serialize(r, current_user) for r in replies]
    }


@router.post("", status_code=201)
def create_quick_reply(payload: QuickReplyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Shared replies are added by admins and managers
    if payload.shared and current_user.role not in SUPERVISOR_ROLES:
        raise HTTPException(status_code=403, detail="Only admins and managers can add shared quick replies")

    # 2. Same shortcut can't be used twice in one list, and each list has a limit
    if _shortcut_taken(db, current_user, payload.shortcut, payload.shared):
        raise HTTPException(status_code=409, detail=f"/{payload.shortcut} already exists")

    count = db.query(QuickReply.id).filter(QuickReply.organization_id == current_user.organization_id)
    count = count.filter(QuickReply.owner_user_id.is_(None)) if payload.shared else count.filter(QuickReply.owner_user_id == current_user.id)
    if count.count() >= MAX_REPLIES_PER_LIST:
        raise HTTPException(status_code=400, detail=f"A list can hold up to {MAX_REPLIES_PER_LIST} quick replies")

    # 3. Save
    reply = QuickReply(
        organization_id=current_user.organization_id,
        owner_user_id=None if payload.shared else current_user.id,
        shortcut=payload.shortcut,
        content=payload.content,
        created_by_id=current_user.id
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)

    return _serialize(reply, current_user)


@router.patch("/{reply_id}")
def update_quick_reply(reply_id: int, payload: QuickReplyUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    reply = _editable_reply(db, reply_id, current_user)

    if _shortcut_taken(db, current_user, payload.shortcut, reply.owner_user_id is None, exclude_id=reply.id):
        raise HTTPException(status_code=409, detail=f"/{payload.shortcut} already exists")

    reply.shortcut = payload.shortcut
    reply.content = payload.content
    db.commit()
    db.refresh(reply)

    return _serialize(reply, current_user)


@router.delete("/{reply_id}")
def delete_quick_reply(reply_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    reply = _editable_reply(db, reply_id, current_user)
    db.delete(reply)
    db.commit()

    return {"id": reply_id}
