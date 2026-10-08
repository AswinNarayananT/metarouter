from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app.models.organization_model import Organization, User
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Tenant Authentication"])

class TenantLoginRequest(BaseModel):
    email: EmailStr
    password: str
    org_slug: str  # Extracted from subdomain or input context

@router.post("/login")
def tenant_login(payload: TenantLoginRequest, db: Session = Depends(get_db)):
    print(f"Login attempt for email: {payload.email} with slug: {payload.org_slug}")
    
    org = None
    
    # 1. Fallback handling for local development (localhost without subdomain)
    if payload.org_slug == "default" or not payload.org_slug:
        # Try to find the user first to map them to their organization directly during local dev
        user_check = db.query(User).filter(User.email == payload.email.lower()).first()
        if user_check:
            org = db.query(Organization).filter(Organization.id == user_check.organization_id).first()
        
        # If still not found, fallback to the latest active organization
        if not org:
            org = db.query(Organization).order_by(Organization.created_at.desc()).first()
    else:
        # Standard production subdomain lookup
        org = db.query(Organization).filter(Organization.slug == payload.org_slug).first()

    if not org:
        raise HTTPException(status_code=404, detail="Organization workspace not found")

    # 2. Locate user strictly within this organization
    user = db.query(User).filter(
        User.email == payload.email.lower(),
        User.organization_id == org.id
    ).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    # 3. Generate token carrying isolation data
    token_payload = {
        "sub": user.email,
        "organization_id": org.id,
        "role": user.role  # e.g., "admin" or "agent"
    }
    access_token = create_access_token(data=token_payload)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organization_name": org.name
        }
    }