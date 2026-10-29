from pydantic import BaseModel, EmailStr, Field, field_validator
from app.schemas.auth_schema import check_password_strength
from datetime import datetime
from typing import List, Literal, Optional

InvitationStatus = Literal["pending", "accepted", "expired", "revoked"]
# Only workspace roles can be invited (never "super_admin" or anything else)
WorkspaceRole = Literal["admin", "manager", "service"]

# ------------------------------------------------------------------
# Request Schemas
# ------------------------------------------------------------------

MAX_INVITES_PER_REQUEST = 50


class InviteItem(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    role: WorkspaceRole

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must be at least 2 characters")
        return value


class BulkInviteRequest(BaseModel):
    # Capped so one request can't send (or probe) hundreds of emails
    members: List[InviteItem] = Field(..., min_length=1, max_length=MAX_INVITES_PER_REQUEST)


class SingleInviteRequest(BaseModel):
    name: str
    email: EmailStr
    role: WorkspaceRole


class AcceptInvitationRequest(BaseModel):
    token: str
    name: str = Field(..., min_length=2, max_length=120)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must be at least 2 characters")
        return value

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        return check_password_strength(value)


# ------------------------------------------------------------------
# Response Schemas
# ------------------------------------------------------------------

class InvitationDetail(BaseModel):
    name: str
    email: str
    role: str
    invite_link: str
    resent: bool = False  # Replaced a pending invite: the old link no longer works

    class Config:
        from_attributes = True


class SkippedInvitation(BaseModel):
    email: str
    reason: str


class BulkInvitationResponse(BaseModel):
    message: str
    invitations: List[InvitationDetail]
    skipped: List[SkippedInvitation] = []


class VerifyInvitationResponse(BaseModel):
    email: str
    name: str
    role: str
    organization_name: str
    org_slug: str

    class Config:
        from_attributes = True


class InvitationListItem(BaseModel):
    id: int
    name: str
    email: str
    role: str
    status: InvitationStatus
    expires_at: datetime
    created_at: Optional[datetime] = None
    invite_link: Optional[str] = None  # Pending invites only, for "Copy link"


class PaginatedInvitationsResponse(BaseModel):
    items: List[InvitationListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class SingleInvitationResponse(BaseModel):
    message: str
    token: str
    invite_link: str
    expires_at: datetime

    class Config:
        from_attributes = True