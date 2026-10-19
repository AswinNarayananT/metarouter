from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models.admin_model import SuperAdmin
from app.schemas.super_admin_schema import SuperAdminLoginRequest, TokenResponse, SuperAdminResponse
from app.schemas.auth_schema import ChangePasswordRequest, UpdateNameRequest
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.core.deps import get_current_super_admin
from app.core.login_guard import check_login_allowed, record_failed_login, clear_failed_logins
from app.core.token_blacklist import blacklist_token

router = APIRouter(prefix="/superadmin", tags=["Super Admin Authentication"])

@router.post("/login", response_model=TokenResponse)
def super_admin_login(payload: SuperAdminLoginRequest, request: Request, db: Session = Depends(get_db)):
    # Too many failed attempts for this email / IP -> 429 before checking anything
    check_login_allowed("super_admin", payload.email, request)

    # 1. Query the Super Admin by email
    admin = db.query(SuperAdmin).filter(SuperAdmin.email == payload.email).first()

    # 2. Verify existence and password
    if not admin or not verify_password(payload.password, admin.hashed_password):
        record_failed_login("super_admin", payload.email, request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clear_failed_logins("super_admin", payload.email, request)

    # 3. Create JWT access token embedding the sub and role
    access_token_payload = {
        "sub": admin.email,
        "role": "super_admin",
        "admin_id": admin.id
    }
    access_token = create_access_token(data=access_token_payload, expires_delta=timedelta(minutes=settings.SUPER_ADMIN_TOKEN_EXPIRE_MINUTES))

    # 4. Construct user response matching SuperAdminResponse schema
    admin_response = SuperAdminResponse(
        id=admin.id,
        name=admin.name,
        email=admin.email,
        role="super_admin",
        created_at=admin.created_at
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": admin_response
    }


@router.post("/logout")
def super_admin_logout(authorization: Optional[str] = Header(None)):
    # Revoke this token right away (an expired or invalid one needs nothing)
    if authorization and authorization.startswith("Bearer "):
        payload = decode_access_token(authorization.replace("Bearer ", ""))
        if payload:
            blacklist_token(payload)

    return {"message": "Logged out"}


@router.patch("/profile", response_model=SuperAdminResponse)
def update_super_admin_profile(
    payload: UpdateNameRequest,
    db: Session = Depends(get_db),
    admin: SuperAdmin = Depends(get_current_super_admin)
):
    admin.name = payload.name
    db.commit()
    db.refresh(admin)
    return SuperAdminResponse(
        id=admin.id,
        name=admin.name,
        email=admin.email,
        role="super_admin",
        created_at=admin.created_at
    )


@router.post("/change-password")
def change_super_admin_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    admin: SuperAdmin = Depends(get_current_super_admin)
):
    # 400 (not 401) so the client doesn't treat a wrong password as an expired session
    if not verify_password(payload.current_password, admin.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if verify_password(payload.new_password, admin.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different from the current password")

    admin.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return {"message": "Password updated successfully"}
