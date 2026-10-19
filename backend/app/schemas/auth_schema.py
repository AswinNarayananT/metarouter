import re
from pydantic import BaseModel, EmailStr, Field, field_validator

class WorkspaceLoginRequest(BaseModel):
    email: EmailStr
    password: str
    org_slug: str  # Extracted from subdomain or input context

class WorkspaceUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    organization_name: str

class WorkspaceLoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: WorkspaceUserResponse

class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str

def check_password_strength(value: str) -> str:
    """Shared password policy: mirrors the rules shown in the frontend forms."""
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", value):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", value):
        raise ValueError("Password must contain at least one number")
    return value

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        return check_password_strength(value)

class UpdateNameRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must be at least 2 characters")
        return value
