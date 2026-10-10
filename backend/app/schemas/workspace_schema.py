from pydantic import BaseModel, EmailStr
from typing import Optional, List

# For inviting or listing team members
class TeamMemberResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    is_active: bool

    class Config:
        from_attributes = True

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