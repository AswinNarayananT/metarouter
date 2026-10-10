from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict

class SuperAdminLoginRequest(BaseModel):
    email: EmailStr
    password: str

class SuperAdminResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str = "super_admin"
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: SuperAdminResponse
