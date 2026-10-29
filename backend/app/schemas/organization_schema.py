from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator


class AdminUserPublic(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


def current_users(org) -> list:
    # Removed members' archived rows are kept for history but don't count as members
    return [u for u in (org.users or []) if not u.removed_at]


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
        users = current_users(org)
        admin = next((u for u in users if u.role == "admin"), users[0] if users else None)
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
            user_count=len(users),
        )


class WhatsAppNumberDetail(BaseModel):
    id: int
    phone_number_id: str
    display_phone_number: str
    waba_id: Optional[str] = None
    verified_name: Optional[str] = None
    quality_rating: str = "GREEN"
    messaging_tier: str = "TIER_1K"
    status: str = "connected"
    disconnected_at: Optional[datetime] = None
    disconnect_reason: Optional[str] = None
    disconnect_subcode: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MonthlyMessageBreakdown(BaseModel):
    customer: int = 0
    ai: int = 0
    agent: int = 0
    total: int = 0


class OrganizationMetrics(BaseModel):
    messages_this_month: MonthlyMessageBreakdown
    total_ai_replies: int = 0
    broadcasts_sent: int = 0
    broadcasts_completed: int = 0
    active_chats: int = 0
    total_chats: int = 0
    total_tickets: int = 0
    open_tickets: int = 0
    resolved_tickets: int = 0
    storage_used_bytes: int = 0
    last_activity: Optional[datetime] = None


class OrganizationMemberPublic(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    removed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


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
    whatsapp_numbers: List[WhatsAppNumberDetail] = []
    members: List[OrganizationMemberPublic] = []
    metrics: Optional[OrganizationMetrics] = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_custom(cls, org, metrics: Optional[OrganizationMetrics] = None) -> "OrganizationDetail":
        users = current_users(org)
        admin = next((u for u in users if u.role == "admin"), users[0] if users else None)
        members_list = [
            OrganizationMemberPublic(
                id=u.id,
                name=u.name,
                email=u.email,
                role=u.role or "agent",
                is_active=bool(u.is_active),
                created_at=u.created_at,
                removed_at=u.removed_at,
            )
            for u in (org.users or [])
        ]
        wa_numbers = [
            WhatsAppNumberDetail(
                id=w.id,
                phone_number_id=w.phone_number_id,
                display_phone_number=w.display_phone_number,
                waba_id=w.waba_id,
                verified_name=w.verified_name,
                quality_rating=w.quality_rating or "GREEN",
                messaging_tier=w.messaging_tier or "TIER_1K",
                status=w.status or "connected",
                disconnected_at=w.disconnected_at,
                disconnect_reason=w.disconnect_reason,
                disconnect_subcode=w.disconnect_subcode,
                created_at=w.created_at,
            )
            for w in (org.whatsapp_numbers or [])
        ]
        return cls(
            id=org.id,
            name=org.name,
            slug=org.slug,
            subscription_status=org.subscription_status or "active",
            created_at=org.created_at,
            support_email=org.profile.support_email if org.profile else "",
            support_phone=org.profile.support_phone if org.profile else "",
            admin=AdminUserPublic.model_validate(admin) if admin else None,
            user_count=len(users),
            whatsapp_count=len(org.whatsapp_numbers) if org.whatsapp_numbers else 0,
            whatsapp_numbers=wa_numbers,
            members=members_list,
            metrics=metrics,
        )


class DisconnectedNumberItem(BaseModel):
    id: int
    display_phone_number: str
    organization_id: int
    organization_name: str
    organization_slug: str
    disconnected_at: Optional[datetime] = None
    disconnect_reason: Optional[str] = None
    disconnect_subcode: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class StuckTasksBreakdown(BaseModel):
    total_stuck: int = 0
    stuck_messages: int = 0
    stuck_documents: int = 0
    stuck_attachments: int = 0
    stalled_broadcasts: int = 0

    model_config = ConfigDict(from_attributes=True)


class DashboardStats(BaseModel):
    organization_count: int
    active_organization_count: int
    user_count: int
    whatsapp_count: int
    recent_organizations: List[OrganizationListItem]
    disconnected_numbers_count: int = 0
    disconnected_numbers: List[DisconnectedNumberItem] = []
    failed_messages_24h: int = 0
    gemini_errors_24h: int = 0
    stuck_tasks_count: int = 0
    stuck_tasks: StuckTasksBreakdown = Field(default_factory=StuckTasksBreakdown)

    model_config = ConfigDict(from_attributes=True)

class UpdateStatusRequest(BaseModel):
    subscription_status: Literal["active", "inactive"]  # inactive = suspended: the workspace can't log in or use the API


class ImpersonateUserRequest(BaseModel):
    user_id: int
    reason: str = Field(..., min_length=5, max_length=200)  # Ticket number or what the client reported; kept in the audit log

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 5:
            raise ValueError("Reason must be at least 5 characters")
        return value


class PaginatedOrganizationsResponse(BaseModel):
    items: List[OrganizationListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class OrganizationInviteCreateRequest(BaseModel):
    email: EmailStr
    organization_name: Optional[str] = Field(None, max_length=120)
    expires_in_days: int = Field(default=3, ge=1, le=30)


class OrganizationInviteResponse(BaseModel):
    id: int
    email: str
    organization_name: Optional[str] = None
    expires_at: datetime  # The link itself is only ever emailed (stored as a hash)
    is_used: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class VerifyOrganizationInviteRequest(BaseModel):
    # Sent in the body, not the URL, so the link never lands in server access logs
    token: str = Field(..., min_length=10, max_length=200)


class VerifyOrganizationInviteResponse(BaseModel):
    valid: bool
    email: str
    organization_name: Optional[str] = None
    expires_at: datetime


class CompleteOrganizationOnboardingRequest(BaseModel):
    token: str
    admin_name: str = Field(..., min_length=2, max_length=120)
    admin_password: str = Field(..., min_length=8, max_length=128)
    organization_name: str = Field(..., min_length=2, max_length=120)
    slug: Optional[str] = Field(None, min_length=2, max_length=80)
    support_email: Optional[EmailStr] = None
    support_phone: Optional[str] = Field(None, max_length=32)


class CompleteOrganizationOnboardingResponse(BaseModel):
    message: str
    organization_id: int
    organization_name: str
    slug: str
    admin_email: str