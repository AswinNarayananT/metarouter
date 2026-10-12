from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import List, Literal, Optional

InvitationStatus = Literal["pending", "accepted", "expired"]

# ------------------------------------------------------------------
# Request Schemas
# ------------------------------------------------------------------

class InviteItem(BaseModel):
    name: str
    email: EmailStr
    role: str  # "admin", "manager", "service"


class BulkInviteRequest(BaseModel):
    members: List[InviteItem]


class SingleInviteRequest(BaseModel):
    name: str
    email: EmailStr
    role: str  # "admin", "manager", "service"


class AcceptInvitationRequest(BaseModel):
    token: str
    name: str
    password: str


# ------------------------------------------------------------------
# Response Schemas
# ------------------------------------------------------------------

class InvitationDetail(BaseModel):
    name: str
    email: str
    role: str
    invite_link: str

    class Config:
        from_attributes = True


class BulkInvitationResponse(BaseModel):
    message: str
    invitations: List[InvitationDetail]


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