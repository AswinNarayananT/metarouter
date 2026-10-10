from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import List

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


class SingleInvitationResponse(BaseModel):
    message: str
    token: str
    invite_link: str
    expires_at: datetime

    class Config:
        from_attributes = True