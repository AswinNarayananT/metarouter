import re
from pydantic import BaseModel, EmailStr, Field, field_validator

class WorkspaceLoginRequest(BaseModel):
    email: EmailStr
    password: str
    org_slug: str  # Extracted from subdomain or input context

from typing import Optional, Dict, Any

class WorkspaceUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    organization_name: str
    organization_id: Optional[int] = None
    features: Optional[Dict[str, bool]] = None
    impersonation: Optional[Dict[str, Any]] = None  # Set only in a super admin's read-only support session

class ImpersonationExchangeRequest(BaseModel):
    # Sent in the body, not the URL, so the one-time code never lands in server access logs
    code: str = Field(..., min_length=10, max_length=200)

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

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetTokenRequest(BaseModel):
    # In the body, not the URL, so the token never lands in server access logs
    token: str = Field(..., min_length=10, max_length=200)

class ResetPasswordRequest(ResetTokenRequest):
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
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
