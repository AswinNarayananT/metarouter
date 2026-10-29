import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.core.security import get_password_hash, hash_invite_token
from app.services.audit_service import record_audit_log, get_client_ip
from app.models.organization_model import Organization, OrganizationProfile, User
from app.models.organization_invitation_model import OrganizationInvitation
from app.schemas.organization_schema import (
    VerifyOrganizationInviteRequest,
    VerifyOrganizationInviteResponse,
    CompleteOrganizationOnboardingRequest,
    CompleteOrganizationOnboardingResponse,
)

router = APIRouter(prefix="/onboarding", tags=["Workspace Onboarding"])


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:80] or "workspace"


def unique_slug(db: Session, base: str) -> str:
    slug = slugify(base)
    candidate = slug
    n = 2
    while db.query(Organization.id).filter(Organization.slug == candidate).first():
        suffix = f"-{n}"
        candidate = f"{slug[: 80 - len(suffix)]}{suffix}"
        n += 1
    return candidate


@router.post("/verify", response_model=VerifyOrganizationInviteResponse)
def verify_organization_invitation(payload: VerifyOrganizationInviteRequest, db: Session = Depends(get_db)):
    invitation = (
        db.query(OrganizationInvitation)
        .filter(
            OrganizationInvitation.token == hash_invite_token(payload.token),
            OrganizationInvitation.is_used == False,
        )
        .first()
    )

    if not invitation or invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link is invalid or has expired. Please contact support or request a new invitation."
        )

    # Check if this email is already registered
    email = invitation.email.lower()
    if db.query(User.id).filter(func.lower(User.email) == email, User.removed_at == None).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email has already been registered. Please log in directly."
        )

    return VerifyOrganizationInviteResponse(
        valid=True,
        email=invitation.email,
        organization_name=invitation.organization_name,
        expires_at=invitation.expires_at,
    )


@router.post("/complete", response_model=CompleteOrganizationOnboardingResponse)
def complete_organization_onboarding(
    payload: CompleteOrganizationOnboardingRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    # Row locked until commit: a second click waits, then finds the invitation used (never two workspaces)
    invitation = (
        db.query(OrganizationInvitation)
        .filter(
            OrganizationInvitation.token == hash_invite_token(payload.token),
            OrganizationInvitation.is_used == False,
        )
        .with_for_update()
        .first()
    )

    if not invitation or invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token."
        )

    email = invitation.email.lower().strip()

    # Re-check user email availability (a removed member's archived row doesn't count)
    if db.query(User.id).filter(func.lower(User.email) == email, User.removed_at == None).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists. Log in instead."
        )

    # Compute unique slug
    base_slug = payload.slug or payload.organization_name
    slug = unique_slug(db, base_slug)

    # 1. Create Organization
    org = Organization(
        name=payload.organization_name.strip(),
        slug=slug,
        subscription_status="active",
    )
    db.add(org)
    db.flush()

    # 2. Create Organization Profile
    support_email = (payload.support_email or email).strip()
    support_phone = (payload.support_phone or "").strip()
    profile = OrganizationProfile(
        organization_id=org.id,
        support_email=support_email,
        support_phone=support_phone,
    )
    db.add(profile)

    # 3. Create Organization Admin User
    hashed_password = get_password_hash(payload.admin_password)
    admin_user = User(
        organization_id=org.id,
        name=payload.admin_name.strip(),
        email=email,
        hashed_password=hashed_password,
        role="admin",
        is_active=True,
    )
    db.add(admin_user)

    # 4. Mark invitation used
    invitation.is_used = True

    db.commit()

    record_audit_log(
        db,
        action="ORGANIZATION_ONBOARDED",
        category="organization",
        actor_type="user",
        actor_id=admin_user.id,
        actor_email=admin_user.email,
        target_type="organization",
        target_id=org.id,
        target_name=org.name,
        details={
            "slug": org.slug,
            "admin_name": admin_user.name,
            "admin_email": admin_user.email,
            "invitation_id": invitation.id,
        },
        ip_address=get_client_ip(request),
        status="success",
    )

    return CompleteOrganizationOnboardingResponse(
        message="Workspace and administrator account created successfully. You can now log in.",
        organization_id=org.id,
        organization_name=org.name,
        slug=org.slug,
        admin_email=admin_user.email,
    )
