from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, ConfigDict, Field


class AdminUserPublic(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OrganizationListItem(BaseModel):
    id: int
    name: str
    slug: str
    subscription_status: str
    created_at: Optional[datetime] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None
    user_count: int = 0

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_custom(cls, org) -> "OrganizationListItem":
        admin = next((u for u in org.users if u.role == "admin"), org.users[0] if org.users else None)
        return cls(
            id=org.id,
            name=org.name,
            slug=org.slug,
            subscription_status=org.subscription_status or "active",
            created_at=org.created_at,
            support_email=org.profile.support_email if org.profile else None,
            support_phone=org.profile.support_phone if org.profile else None,
            admin_name=admin.name if admin else None,
            admin_email=admin.email if admin else None,
            user_count=len(org.users),
        )


class OrganizationDetail(BaseModel):
    id: int
    name: str
    slug: str
    subscription_status: str
    created_at: Optional[datetime] = None
    support_email: str
    support_phone: str
    admin: Optional[AdminUserPublic] = None
    user_count: int = 0
    whatsapp_count: int = 0

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_custom(cls, org) -> "OrganizationDetail":
        admin = next((u for u in org.users if u.role == "admin"), org.users[0] if org.users else None)
        return cls(
            id=org.id,
            name=org.name,
            slug=org.slug,
            subscription_status=org.subscription_status or "active",
            created_at=org.created_at,
            support_email=org.profile.support_email if org.profile else "",
            support_phone=org.profile.support_phone if org.profile else "",
            admin=AdminUserPublic.model_validate(admin) if admin else None,
            user_count=len(org.users),
            whatsapp_count=len(org.whatsapp_numbers),
        )


class OrganizationCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    slug: Optional[str] = Field(None, min_length=2, max_length=80)
    support_email: EmailStr
    support_phone: str = Field(..., min_length=6, max_length=32)
    subscription_status: Literal["active", "inactive"] = Field(default="active")
    admin_name: str = Field(..., min_length=2, max_length=120)
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=8, max_length=128)


class OrganizationCreateResponse(OrganizationDetail):
    admin_password: str


class DashboardStats(BaseModel):
    organization_count: int
    active_organization_count: int
    user_count: int
    whatsapp_count: int
    recent_organizations: List[OrganizationListItem]

    model_config = ConfigDict(from_attributes=True)

class UpdateStatusRequest(BaseModel):
    subscription_status: Literal["active", "inactive"]  # inactive = suspended: the workspace can't log in or use the API    