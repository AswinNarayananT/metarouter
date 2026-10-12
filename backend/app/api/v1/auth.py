from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie, Header
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.organization_model import Organization, User
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_refresh_token, get_current_user_payload
from app.core.deps import get_current_tenant_user
from app.schemas.auth_schema import TenantLoginRequest, TenantLoginResponse, TokenRefreshResponse, ChangePasswordRequest

router = APIRouter(prefix="/auth", tags=["Tenant Authentication"])

@router.post("/login", response_model=TenantLoginResponse)
def workspace_login(payload: TenantLoginRequest, response: Response, db: Session = Depends(get_db)):
    print(f"Login attempt for email: {payload.email} with slug: {payload.org_slug}")
    
    org = None
    
    # 1. Fallback handling for local development (localhost without subdomain)
    if payload.org_slug == "default" or not payload.org_slug:
        user_check = db.query(User).filter(User.email == payload.email.lower()).first()
        if user_check:
            org = db.query(Organization).filter(Organization.id == user_check.organization_id).first()
        
        if not org:
            org = db.query(Organization).order_by(Organization.created_at.desc()).first()
    else:
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

    # 3. Generate tokens carrying isolation data
    token_payload = {
        "sub": user.email,
        "organization_id": org.id,
        "role": user.role
    }
    access_token = create_access_token(data=token_payload)
    refresh_token = create_refresh_token(data=token_payload)

    # 4. Set Refresh Token in an HTTP-only Cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # Set to True in production (HTTPS)
        samesite="lax",
        max_age=7 * 24 * 60 * 60  # 7 days in seconds
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organization_id":org.id,
            "organization_name": org.name
        }
    }


@router.post("/refresh-token", response_model=TokenRefreshResponse)
def refresh_access_token(response: Response, refresh_token: Optional[str] = Cookie(default=None), db: Session = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    
    # Decode and validate using our helper function
    payload = decode_refresh_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    email: str = payload.get("sub")
    org_id: int = payload.get("organization_id")

    # Verify user still exists and is active
    user = db.query(User).filter(User.email == email, User.organization_id == org_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not authorized")

    # Issue new access token
    new_token_payload = {
        "sub": user.email,
        "organization_id": org_id,
        "role": user.role
    }
    new_access_token = create_access_token(data=new_token_payload)

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


@router.get("/me")
def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
    
    token = authorization.replace("Bearer ", "")
    payload = get_current_user_payload(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    
    email: str = payload.get("sub")
    org_id: int = payload.get("organization_id")
    
    user = db.query(User).filter(
        User.email == email,
        User.organization_id == org_id
    ).first()
    
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    
    org = db.query(Organization).filter(Organization.id == org_id).first()
    
    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organization_id":org.id if org else None,
            "organization_name": org.name if org else None
        }
    }

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user)
):
    # 400 (not 401) so the client doesn't treat a wrong password as an expired session
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different from the current password")

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return {"message": "Password updated successfully"}
