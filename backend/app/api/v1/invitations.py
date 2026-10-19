from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import math
import secrets
from typing import List, Optional

from sqlalchemy import func
from app.database import get_db
from app.models.admin_model import SuperAdmin
from app.models.organization_model import Organization, User
from app.models.invitation_model import Invitation
from app.schemas.invitation_schema import (
    BulkInviteRequest,
    AcceptInvitationRequest,
    VerifyInvitationResponse,
    BulkInvitationResponse,
    InvitationStatus,
    PaginatedInvitationsResponse
)
from app.core.security import  get_password_hash
from app.core.deps import get_current_workspace_user
from app.config import settings
from app.workers.tasks.email_tasks import send_invitation_email_task

router = APIRouter(prefix="/invitations", tags=["Workspace Invitations"])


def _invitation_status(invitation: Invitation, now: datetime) -> str:
    if invitation.is_used:
        return "accepted"
    if invitation.expires_at < now:
        return "expired"
    return "pending"


# List invitations sent by the organization (admin only, paginated)
@router.get("", response_model=PaginatedInvitationsResponse)
def list_invitations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status_filter: Optional[InvitationStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can view invitations")

    now = datetime.now(timezone.utc)
    query = db.query(Invitation).filter(Invitation.organization_id == current_user.organization_id)

    if status_filter == "accepted":
        query = query.filter(Invitation.is_used == True)
    elif status_filter == "expired":
        query = query.filter(Invitation.is_used == False, Invitation.expires_at < now)
    elif status_filter == "pending":
        query = query.filter(Invitation.is_used == False, Invitation.expires_at >= now)

    total = query.count()
    invitations = (
        query.order_by(Invitation.created_at.desc(), Invitation.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "id": inv.id,
                "name": inv.name,
                "email": inv.email,
                "role": inv.role,
                "status": _invitation_status(inv, now),
                "expires_at": inv.expires_at,
                "created_at": inv.created_at,
            }
            for inv in invitations
        ],
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

    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    created_invitations = []
    skipped = []

    for item in payload.members:
        # Emails are unique across all workspaces, and platform admin emails can never join a workspace
        reason = _email_unavailable_reason(db, item.email, current_user.organization_id)
        if reason:
            skipped.append({"email": item.email, "reason": reason})
            continue

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=3)

        invitation = Invitation(
            organization_id=current_user.organization_id,
            name=item.name,
            email=item.email.lower(),
            role=item.role,
            token=token,
            expires_at=expires_at
        )
        db.add(invitation)
        db.commit()

        invite_link = f"{settings.FRONTEND_BASE_URL}/register?token={token}"
        
        # Dispatch email task asynchronously via Celery
        send_invitation_email_task.delay(
            to_email=item.email,
            name=item.name,
            org_name=org.name if org else "Workspace",
            invite_link=invite_link
        )

        created_invitations.append({
            "name": item.name,
            "email": item.email,
            "role": item.role,
            "invite_link": invite_link
        })

    return {
        "message": "Invitations generated and email tasks queued successfully",
        "invitations": created_invitations,
        "skipped": skipped
    }


def _email_unavailable_reason(db: Session, email: str, organization_id: int) -> Optional[str]:
    email = email.lower()
    if db.query(SuperAdmin.id).filter(func.lower(SuperAdmin.email) == email).first():
        return "This email can't be invited"

    existing_user = db.query(User).filter(func.lower(User.email) == email).first()
    if existing_user:
        return "Already a member of this workspace" if existing_user.organization_id == organization_id else "This email is already used by another workspace"
    return None
# (Keep your verify and accept endpoints as they are)


# 2. Public endpoint for new member to validate token before rendering registration form
@router.get("/verify/{token}", response_model=VerifyInvitationResponse)
def verify_invitation(token: str, db: Session = Depends(get_db)):
    invitation = db.query(Invitation).filter(
        Invitation.token == token,
        Invitation.is_used == False
    ).first()

    if not invitation or invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired invitation token")

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
    invitation = db.query(Invitation).filter(
        Invitation.token == payload.token,
        Invitation.is_used == False
    ).first()

    if not invitation or invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired invitation token")

    # The email may have been taken since the invitation was sent
    if _email_unavailable_reason(db, invitation.email, invitation.organization_id):
        raise HTTPException(status_code=400, detail="An account with this email already exists. Log in instead.")

    # Create the new workspace user tied strictly to the organization
    hashed_password = get_password_hash(payload.password)
    new_user = User(
        organization_id=invitation.organization_id,
        name=payload.name,  # Can use payload name or fallback to invitation.name
        email=invitation.email,
        hashed_password=hashed_password,
        role=invitation.role,
        is_active=True
    )
    
    # Mark invitation as used (Single-use security enforcement)
    invitation.is_used = True

    db.add(new_user)
    db.commit()

    return {"message": "Account created successfully. You can now log in."}