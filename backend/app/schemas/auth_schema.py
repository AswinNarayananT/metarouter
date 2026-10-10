from pydantic import BaseModel, EmailStr

class TenantLoginRequest(BaseModel):
    email: EmailStr
    password: str
    org_slug: str  # Extracted from subdomain or input context

class WorkspaceUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    organization_name: str

class TenantLoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: WorkspaceUserResponse

class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str