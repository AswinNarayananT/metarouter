from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from app.schemas.invitation_schema import WorkspaceRole

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