from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import secrets
from typing import List

from app.database import get_db
from app.models.organization_model import Organization, User
from app.models.invitation_model import Invitation
from app.schemas.invitation_schema import (
    BulkInviteRequest,
    AcceptInvitationRequest,
    VerifyInvitationResponse,
    BulkInvitationResponse
)
from app.core.security import  get_password_hash
from app.core.deps import get_current_tenant_user
from app.config import settings

router = APIRouter(prefix="/invitations", tags=["Workspace Invitations"])

@router.post("/generate", response_model=BulkInvitationResponse)
def generate_invitations(
    payload: BulkInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can invite members")

    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    created_invitations = []

    for item in payload.members:
        # Check if user already exists
        existing_user = db.query(User).filter(
            User.email == item.email.lower(),
            User.organization_id == current_user.organization_id
        ).first()
        if existing_user:
            continue  # Skip or handle duplicates

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
        created_invitations.append({
            "name": item.name,
            "email": item.email,
            "role": item.role,
            "invite_link": invite_link
        })

    return {
        "message": "Invitations generated successfully",
        "invitations": created_invitations
    }

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

    # Create the new tenant user tied strictly to the organization
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