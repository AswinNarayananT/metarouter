from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import math
import secrets
from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.core.redis_client import redis_client
from app.models.admin_model import SuperAdmin
from app.models.organization_model import Organization, User
from app.models.invitation_model import Invitation
from app.schemas.invitation_schema import (
    BulkInviteRequest,
    AcceptInvitationRequest,
    VerifyInvitationResponse,
    BulkInvitationResponse,
    InvitationStatus,
    InvitationDetail,
    InvitationListItem,
    PaginatedInvitationsResponse
)
from app.core.security import  get_password_hash
from app.core.deps import get_current_workspace_user
from app.config import settings
from app.workers.tasks.email_tasks import send_invitation_email_task
from app.services.notification_service import notify_member_joined

router = APIRouter(prefix="/invitations", tags=["Workspace Invitations"])

ROLE_LABELS = {"admin": "Administrator", "manager": "Manager", "service": "Service"}
EMAIL_UNAVAILABLE_REASON = "This email can't be invited. Ask them to use a different email, such as their work address."
EMAIL_TAKEN_ON_ACCEPT = "This email already has a MetaRouter account in another workspace. Ask your admin to invite a different email."


def _invitation_status(invitation: Invitation, now: datetime) -> str:
    if invitation.is_used:
        return "accepted"
    if invitation.revoked_at:
        return "revoked"
    if invitation.expires_at < now:
        return "expired"
    return "pending"


# List invitations sent by the organization (admin only, paginated)
@router.get("", response_model=PaginatedInvitationsResponse)
def list_invitations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status_filter: Optional[InvitationStatus] = Query(None, alias="status"),
    search: Optional[str] = Query(None, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can view invitations")

    now = datetime.now(timezone.utc)
    query = db.query(Invitation).filter(Invitation.organization_id == current_user.organization_id)

    # Name or email, case-insensitive
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(Invitation.name.ilike(term), Invitation.email.ilike(term)))

    if status_filter == "accepted":
        query = query.filter(Invitation.is_used == True)
    elif status_filter == "revoked":
        query = query.filter(Invitation.is_used == False, Invitation.revoked_at != None)
    elif status_filter == "expired":
        query = query.filter(Invitation.is_used == False, Invitation.revoked_at == None, Invitation.expires_at < now)
    elif status_filter == "pending":
        query = query.filter(Invitation.is_used == False, Invitation.revoked_at == None, Invitation.expires_at >= now)

    total = query.count()
    invitations = (
        query.order_by(Invitation.created_at.desc(), Invitation.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [_invitation_list_item(inv, now) for inv in invitations],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
    }

@router.post("/generate", response_model=BulkInvitationResponse)
def generate_invitations(
    payload: BulkInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can invite members")

    # 1. The same email twice in one request is invited once
    members = list({item.email.lower(): item for item in payload.members}.values())

    # 2. Every email checked counts toward the hourly limit (checking is what reveals whether an email is taken)
    _use_invite_quota(current_user.organization_id, len(members))

    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    created_invitations = []
    skipped = []

    for item in members:
        # 3. Emails are unique across all workspaces, and platform admin emails can never join a workspace
        reason = _email_unavailable_reason(db, item.email, current_user.organization_id)
        if reason:
            skipped.append({"email": item.email, "reason": reason})
            continue

        created_invitations.append(_send_invitation(db, org, item.name, item.email, item.role))

    return {
        "message": "Invitations generated and email tasks queued successfully",
        "invitations": created_invitations,
        "skipped": skipped
    }


@router.post("/{invitation_id}/revoke", response_model=InvitationListItem)
def revoke_invitation(invitation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can revoke invitations")

    # 2. Locate the invitation strictly within this organization
    invitation = _find_invitation(db, invitation_id, current_user.organization_id)

    # 3. An accepted invite is a member now
    if invitation.is_used:
        raise HTTPException(status_code=400, detail="This invitation was already accepted. Remove the member from Team Members instead.")

    # 4. The link stops working (revoking twice changes nothing)
    if not invitation.revoked_at:
        invitation.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(invitation)

    return _invitation_list_item(invitation, datetime.now(timezone.utc))


@router.post("/{invitation_id}/resend", response_model=InvitationDetail)
def resend_invitation(invitation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can invite members")

    # 2. Locate the invitation strictly within this organization
    invitation = _find_invitation(db, invitation_id, current_user.organization_id)

    if invitation.is_used:
        raise HTTPException(status_code=400, detail="This invitation was already accepted.")

    _use_invite_quota(current_user.organization_id, 1)

    # 3. The email may have joined a workspace since it was sent
    reason = _email_unavailable_reason(db, invitation.email, current_user.organization_id)
    if reason:
        raise HTTPException(status_code=400, detail=reason)

    # 4. A fresh 3-day link by email; the old one stops working
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    return _send_invitation(db, org, invitation.name, invitation.email, invitation.role)


def _send_invitation(db: Session, org: Organization, name: str, email: str, role: str) -> dict:
    # Invited before and not used yet: that link stops working, so one person has one valid invite
    now = datetime.now(timezone.utc)
    pending = db.query(Invitation).filter(
        Invitation.organization_id == org.id,
        func.lower(Invitation.email) == email.lower(),
        Invitation.is_used == False,
        Invitation.revoked_at == None,
        Invitation.expires_at >= now
    ).all()
    for old_invite in pending:
        old_invite.expires_at = now

    token = secrets.token_urlsafe(32)
    db.add(Invitation(
        organization_id=org.id,
        name=name,
        email=email.lower(),
        role=role,
        token=token,
        expires_at=now + timedelta(days=3)
    ))
    db.commit()

    invite_link = _invite_link(token)

    # Dispatch email task asynchronously via Celery
    send_invitation_email_task.delay(to_email=email, name=name, org_name=org.name, invite_link=invite_link)

    return {"name": name, "email": email, "role": role, "invite_link": invite_link, "resent": bool(pending)}


def _invite_link(token: str) -> str:
    return f"{settings.FRONTEND_BASE_URL}/register?token={token}"


def _invitation_list_item(invitation: Invitation, now: datetime) -> dict:
    status = _invitation_status(invitation, now)
    return {
        "id": invitation.id,
        "name": invitation.name,
        "email": invitation.email,
        "role": invitation.role,
        "status": status,
        "expires_at": invitation.expires_at,
        "created_at": invitation.created_at,
        "invite_link": _invite_link(invitation.token) if status == "pending" else None,
    }


def _find_invitation(db: Session, invitation_id: int, organization_id: int) -> Invitation:
    invitation = db.query(Invitation).filter(Invitation.id == invitation_id, Invitation.organization_id == organization_id).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return invitation


def _find_open_invitation(db: Session, token: str) -> Invitation:
    # The link from the email: unused, not revoked and not expired
    invitation = db.query(Invitation).filter(Invitation.token == token, Invitation.is_used == False).first()
    if invitation and invitation.revoked_at:
        raise HTTPException(status_code=400, detail="This invitation was cancelled. Ask your workspace admin for a new one.")
    if not invitation or invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired invitation token")
    return invitation


def _email_unavailable_reason(db: Session, email: str, organization_id: int) -> Optional[str]:
    email = email.lower()

    # A member of this workspace: the admin can already see them on Team Members, so say so plainly
    existing_user = db.query(User).filter(func.lower(User.email) == email, User.removed_at == None).first()
    if existing_user and existing_user.organization_id == organization_id:
        return f"Already a member of this workspace (as {ROLE_LABELS.get(existing_user.role, existing_user.role)}). Change their role on Team Members instead."

    # Another workspace's member or a platform admin: one shared message, so an admin can't tell which (or find
    # the platform admins' emails), and the other workspace is never named.
    # A removed member's archived row doesn't count: they can be invited again here or elsewhere
    is_platform_admin = db.query(SuperAdmin.id).filter(func.lower(SuperAdmin.email) == email).first()
    if existing_user or is_platform_admin:
        return EMAIL_UNAVAILABLE_REASON
    return None


def _use_invite_quota(organization_id: int, count: int):
    # Invite emails per workspace each hour: protects the email sender's reputation and slows down
    # checking many emails for existing accounts
    key = f"invite-quota:org:{organization_id}"
    used = int(redis_client.get(key) or 0)
    if used + count > settings.INVITES_MAX_PER_ORG_PER_HOUR:
        left = max(0, settings.INVITES_MAX_PER_ORG_PER_HOUR - used)
        raise HTTPException(status_code=429, detail=f"Your workspace has reached its limit of {settings.INVITES_MAX_PER_ORG_PER_HOUR} invites per hour ({left} left). Try again later.")
    if redis_client.incrby(key, count) == count:
        redis_client.expire(key, 3600)


# 2. Public endpoint for new member to validate token before rendering registration form
@router.get("/verify/{token}", response_model=VerifyInvitationResponse)
def verify_invitation(token: str, db: Session = Depends(get_db)):
    invitation = _find_open_invitation(db, token)

    org = db.query(Organization).filter(Organization.id == invitation.organization_id).first()

    return {
        "email": invitation.email,
        "name": invitation.name,
        "role": invitation.role,
        "organization_name": org.name,
        "org_slug": org.slug
    }


# 3. Complete registration using the token
@router.post("/accept")
def accept_invitation(payload: AcceptInvitationRequest, db: Session = Depends(get_db)):
    invitation = _find_open_invitation(db, payload.token)

    # The email may have been taken since the invitation was sent
    existing_user = db.query(User).filter(func.lower(User.email) == invitation.email.lower(), User.removed_at == None).first()
    if existing_user and existing_user.organization_id == invitation.organization_id:
        raise HTTPException(status_code=400, detail="You're already a member of this workspace. Log in instead.")
    # Told to the invitee (they own this email), not to the admin
    if _email_unavailable_reason(db, invitation.email, invitation.organization_id):
        raise HTTPException(status_code=400, detail=EMAIL_TAKEN_ON_ACCEPT)

    hashed_password = get_password_hash(payload.password)
    now = datetime.now(timezone.utc)

    # Removed from this workspace before: bring back the same account, so their past messages and tickets reconnect
    returning_user = db.query(User).filter(
        func.lower(User.email) == invitation.email.lower(),
        User.organization_id == invitation.organization_id,
        User.removed_at != None
    ).order_by(User.removed_at.desc()).first()

    if returning_user:
        member = returning_user
        member.name = payload.name
        member.hashed_password = hashed_password
        member.role = invitation.role
        member.is_active = True
        member.removed_at = None
        member.removal_type = None
        member.tokens_valid_after = now
    else:
        # Create the new workspace user tied strictly to the organization
        member = User(
            organization_id=invitation.organization_id,
            name=payload.name,  # Can use payload name or fallback to invitation.name
            email=invitation.email,
            hashed_password=hashed_password,
            role=invitation.role,
            is_active=True
        )
        db.add(member)

    # Mark invitation as used (Single-use security enforcement)
    invitation.is_used = True

    # Two accepts at the same moment (this link twice, or invites from two workspaces): the database's
    # one-current-account-per-email index lets only the first through
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=EMAIL_TAKEN_ON_ACCEPT)

    # The workspace's admins hear it from the bell
    db.refresh(member)
    notify_member_joined(db, member, rejoined=returning_user is not None)

    return {"message": "Account created successfully. You can now log in."}