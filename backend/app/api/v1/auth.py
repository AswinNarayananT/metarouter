from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie, Header
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models.organization_model import Organization, User
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_refresh_token, get_current_user_payload
from app.core.deps import get_current_workspace_user, token_issued_after_reset, ensure_workspace_active, WORKSPACE_SUSPENDED_ERROR
from app.core.login_guard import check_login_allowed, record_failed_login, clear_failed_logins
from app.core.token_blacklist import blacklist_token, is_token_revoked, rotation_marker
from app.schemas.auth_schema import WorkspaceLoginRequest, WorkspaceLoginResponse, TokenRefreshResponse, ChangePasswordRequest, UpdateNameRequest

router = APIRouter(prefix="/auth", tags=["Workspace Authentication"])



def _set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60)

@router.post("/login", response_model=WorkspaceLoginResponse)
def workspace_login(payload: WorkspaceLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    # Too many failed attempts for this email / IP -> 429 before checking anything
    check_login_allowed("workspace", payload.email, request)

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
        raise HTTPException(status_code=404, detail="Workspace not found")

    # 2. Locate user strictly within this organization
    user = db.query(User).filter(
        User.email == payload.email.lower(),
        User.organization_id == org.id
    ).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        record_failed_login("workspace", payload.email, request)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    clear_failed_logins("workspace", payload.email, request)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    # Suspended by the platform admin (checked after the password, so it isn't revealed to guessers)
    if org.subscription_status != "active":
        raise HTTPException(status_code=403, detail=WORKSPACE_SUSPENDED_ERROR)

    # 3. Generate tokens carrying isolation data
    token_payload = {
        "sub": user.email,
        "organization_id": org.id,
        "role": user.role
    }
    access_token = create_access_token(data=token_payload)
    refresh_token = create_refresh_token(data=token_payload)

    # 4. Set Refresh Token in an HTTP-only Cookie
    _set_refresh_cookie(response, refresh_token)

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

    # Logged out, or already replaced by a newer refresh token
    if is_token_revoked(payload):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    email: str = payload.get("sub")
    org_id: int = payload.get("organization_id")

    # Verify user still exists and is active
    user = db.query(User).filter(User.email == email, User.organization_id == org_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not authorized")

    # Refresh tokens from before the last password change are revoked
    if not token_issued_after_reset(payload, user):
        raise HTTPException(status_code=401, detail="Session ended after a password change. Log in again.")

    # A suspended workspace gets no new tokens
    ensure_workspace_active(db, org_id)

    # Issue new access token
    new_token_payload = {
        "sub": user.email,
        "organization_id": org_id,
        "role": user.role
    }
    new_access_token = create_access_token(data=new_token_payload)

    # Rotation: a new refresh token each time; the old one stops working after a short grace period,
    # so a stolen refresh token can't be used for long
    blacklist_token(payload, reason=rotation_marker())
    _set_refresh_cookie(response, create_refresh_token(data=new_token_payload))

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


@router.post("/logout")
def logout(response: Response, authorization: Optional[str] = Header(None), refresh_token: Optional[str] = Cookie(default=None)):
    # 1. Revoke the access token and the refresh token (an expired or invalid one needs nothing)
    if authorization and authorization.startswith("Bearer "):
        access_payload = get_current_user_payload(authorization.replace("Bearer ", ""))
        if access_payload:
            blacklist_token(access_payload)

    if refresh_token:
        refresh_payload = decode_refresh_token(refresh_token)
        if refresh_payload:
            blacklist_token(refresh_payload)

    # 2. Remove the cookie from the browser (same attributes it was set with)
    response.delete_cookie(key="refresh_token", httponly=True, secure=settings.COOKIE_SECURE, samesite="lax")

    return {"message": "Logged out"}


@router.get("/me")
def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
    
    token = authorization.replace("Bearer ", "")
    payload = get_current_user_payload(token)
    
    if not payload or is_token_revoked(payload):
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    email: str = payload.get("sub")
    org_id: int = payload.get("organization_id")

    user = db.query(User).filter(
        User.email == email,
        User.organization_id == org_id
    ).first()
    
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    if not token_issued_after_reset(payload, user):
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    org = ensure_workspace_active(db, org_id)
    
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
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    # 400 (not 401) so the client doesn't treat a wrong password as an expired session
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different from the current password")

    # Every token issued before now stops working (logs out other devices)
    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.tokens_valid_after = datetime.now(timezone.utc)
    db.commit()

    # This device stays logged in with fresh tokens
    token_payload = {"sub": current_user.email, "organization_id": current_user.organization_id, "role": current_user.role}
    _set_refresh_cookie(response, create_refresh_token(data=token_payload))

    return {"message": "Password updated successfully", "access_token": create_access_token(data=token_payload)}


@router.patch("/me")
def update_current_user(
    payload: UpdateNameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    current_user.name = payload.name
    db.commit()
    db.refresh(current_user)

    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()

    return {
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "role": current_user.role,
            "organization_id": current_user.organization_id,
            "organization_name": org.name if org else None
        }
    }
