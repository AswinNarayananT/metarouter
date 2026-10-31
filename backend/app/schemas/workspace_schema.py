from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from app.schemas.invitation_schema import WorkspaceRole
from app.models.organization_model import SUPPORTED_CURRENCIES

# Workspace details an admin can change; only the fields sent are updated
class UpdateOrganizationRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    currency: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must be at least 2 characters")
        return value

    @field_validator("currency")
    @classmethod
    def check_currency(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip().upper()
        if value not in SUPPORTED_CURRENCIES:
            raise ValueError("Unsupported currency")
        return value

# For inviting or listing team members
class TeamMemberResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    is_active: bool
    removed_at: Optional[datetime] = None
    removal_type: Optional[str] = None  # removed (by an admin) or left (themselves)

    class Config:
        from_attributes = True

class PaginatedTeamMembersResponse(BaseModel):
    items: List[TeamMemberResponse]
    total: int  # Matching the search, in the requested tab
    page: int
    page_size: int
    total_pages: int
    current_count: int  # Tab counts, ignoring the search
    removed_count: int  # 0 for non-admins

class UpdateMemberRoleRequest(BaseModel):
    role: WorkspaceRole

class RemoveMemberRequest(BaseModel):
    reassign_to_user_id: Optional[int] = None  # Their open chats and tickets go to this member; None = the unassigned queue

class LeaveWorkspaceRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)  # Confirms it's really them

class MemberOpenWorkResponse(BaseModel):
    open_chats: int
    open_tickets: int


class InviteMemberRequest(BaseModel):
    name: str
    email: EmailStr
    role: str  # e.g., "admin" or "agent"

# For sending broadcasts
class BroadcastRequest(BaseModel):
    template_name: str
    target_segment: str

# For updating workspace settings
class UpdateWorkspaceSettingsRequest(BaseModel):
    organization_name: Optional[str] = None