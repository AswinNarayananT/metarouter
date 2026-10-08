import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.database import get_db
from app.core.deps import get_current_super_admin
from app.core.security import get_password_hash
from app.models.admin_model import SuperAdmin
from app.models.organization_model import Organization, OrganizationProfile, User
from app.models.whatsapp_model import WhatsAppNumber
from app.schemas.organization_schema import (
    OrganizationCreateRequest,
    OrganizationCreateResponse,
    OrganizationDetail,
    OrganizationListItem,
    DashboardStats,
)

router = APIRouter(
    prefix="/admin/organizations",
    tags=["Super Admin Organizations"],
    dependencies=[Depends(get_current_super_admin)],
)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:80] or "org"


def unique_slug(db: Session, base: str) -> str:
    slug = slugify(base)
    candidate = slug
    n = 2
    while db.query(Organization).filter(Organization.slug == candidate).first():
        suffix = f"-{n}"
        candidate = f"{slug[: 80 - len(suffix)]}{suffix}"
        n += 1
    return candidate


@router.get("/stats", response_model=DashboardStats)
def organization_stats(db: Session = Depends(get_db), _: SuperAdmin = Depends(get_current_super_admin)):
    org_count = db.query(func.count(Organization.id)).scalar() or 0
    active_count = (
        db.query(func.count(Organization.id))
        .filter(Organization.subscription_status == "active")
        .scalar()
        or 0
    )
    user_count = db.query(func.count(User.id)).scalar() or 0
    whatsapp_count = db.query(func.count(WhatsAppNumber.id)).scalar() or 0
    
    recent = (
        db.query(Organization)
        .options(joinedload(Organization.profile), joinedload(Organization.users))
        .order_by(Organization.created_at.desc())
        .limit(5)
        .all()
    )

    return DashboardStats(
        organization_count=org_count,
        active_organization_count=active_count,
        user_count=user_count,
        whatsapp_count=whatsapp_count,
        recent_organizations=[OrganizationListItem.from_orm_custom(org) for org in recent],
    )


@router.get("", response_model=list[OrganizationListItem])
def list_organizations(db: Session = Depends(get_db), _: SuperAdmin = Depends(get_current_super_admin)):
    orgs = (
        db.query(Organization)
        .options(joinedload(Organization.profile), joinedload(Organization.users))
        .order_by(Organization.created_at.desc())
        .all()
    )
    return [OrganizationListItem.from_orm_custom(org) for org in orgs]


@router.post("", response_model=OrganizationCreateResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreateRequest,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    existing_email = db.query(User).filter(User.email == payload.admin_email.lower()).first()
    if existing_email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin email is already in use")

    slug = unique_slug(db, payload.slug or payload.name)

    org = Organization(
        name=payload.name.strip(),
        slug=slug,
        subscription_status=payload.subscription_status or "active",
    )
    db.add(org)
    db.flush()

    profile = OrganizationProfile(
        organization_id=org.id,
        support_email=str(payload.support_email).lower(),
        support_phone=payload.support_phone.strip(),
    )
    admin = User(
        organization_id=org.id,
        name=payload.admin_name.strip(),
        email=str(payload.admin_email).lower(),
        hashed_password=get_password_hash(payload.admin_password),
        role="admin",
        is_active=True,
    )
    db.add(profile)
    db.add(admin)
    db.commit()

    # Refetch with all relationships loaded for clean schema mapping
    org = (
        db.query(Organization)
        .options(
            joinedload(Organization.profile),
            joinedload(Organization.users),
            joinedload(Organization.whatsapp_numbers),
        )
        .filter(Organization.id == org.id)
        .first()
    )

    detail_data = OrganizationDetail.from_orm_custom(org).model_dump()
    return OrganizationCreateResponse(**detail_data, admin_password=payload.admin_password)


@router.get("/{organization_id}", response_model=OrganizationDetail)
def get_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    org = (
        db.query(Organization)
        .options(
            joinedload(Organization.profile),
            joinedload(Organization.users),
            joinedload(Organization.whatsapp_numbers),
        )
        .filter(Organization.id == organization_id)
        .first()
    )
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        
    return OrganizationDetail.from_orm_custom(org)