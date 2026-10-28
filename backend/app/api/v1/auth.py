from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie, Header
from typing import Optional
from datetime import datetime, timezone, timedelta
import json
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models.organization_model import Organization, User
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_refresh_token, get_current_user_payload, decode_token_ignoring_expiry
from app.core.deps import get_current_workspace_user, token_issued_after_reset, ensure_workspace_active, WORKSPACE_SUSPENDED_ERROR
from app.core.login_guard import check_login_allowed, record_failed_login, clear_failed_logins
from app.core.token_blacklist import blacklist_token, is_token_revoked, rotation_marker
from app.core.features import get_organization_features
from app.services.conversation_service import handover_roles
from app.core.redis_client import redis_client
from app.services.audit_service import record_audit_log, get_client_ip
from app.schemas.auth_schema import WorkspaceLoginRequest, WorkspaceLoginResponse, TokenRefreshResponse, ChangePasswordRequest, UpdateNameRequest, ImpersonationExchangeRequest

router = APIRouter(prefix="/auth", tags=["Workspace Authentication"])



def _set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60)


def _impersonation_info(payload: dict):
    # Shown in the workspace banner: who is viewing and when the session ends
    if payload.get("impersonated_by") is None:
        return None
    return {
        "admin_email": payload.get("impersonated_by_email"),
        "expires_at": payload.get("exp"),
        "read_only": True
    }

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

    # Say which one is wrong so the user knows what to fix ("field" lets the form highlight it).
    # Super admin login stays generic; the rate limit above slows down guessing which emails exist
    if not user:
        record_failed_login("workspace", payload.email, request)
        raise HTTPException(status_code=401, detail={"message": "No account found with this email. Check it, or ask your workspace admin for an invite.", "field": "email"})

    if not verify_password(payload.password, user.hashed_password):
        record_failed_login("workspace", payload.email, request)
        raise HTTPException(status_code=401, detail={"message": "Incorrect password. Please try again.", "field": "password"})

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

    features = get_organization_features(db, org.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organization_id": org.id,
            "organization_name": org.name,
            "features": features,
        }
    }


@router.post("/impersonate/exchange", response_model=WorkspaceLoginResponse)
def exchange_impersonation_code(payload: ImpersonationExchangeRequest, db: Session = Depends(get_db)):
    # 1. Redeem the one-time code from the super admin panel (GETDEL: it can only be used once)
    raw_session = redis_client.getdel(f"impersonation_code:{payload.code}")
    if not raw_session:
        raise HTTPException(status_code=401, detail="This support link has expired or was already used. Start a new session from the admin panel.")
    session = json.loads(raw_session)

    # 2. The user may have been deactivated, or the workspace suspended, since the code was made
    user = db.query(User).filter(
        User.id == session["user_id"],
        User.organization_id == session["organization_id"]
    ).first()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not authorized")

    org = ensure_workspace_active(db, user.organization_id)

    # 3. Short read-only access token naming the super admin. No refresh token: the session simply ends,
    #    and the browser's own workspace login (refresh cookie) is never touched
    token_payload = {
        "sub": user.email,
        "organization_id": org.id,
        "role": user.role,
        "impersonated_by": session["admin_id"],
        "impersonated_by_email": session["admin_email"]
    }
    access_token = create_access_token(data=token_payload, expires_delta=timedelta(minutes=settings.IMPERSONATION_TOKEN_EXPIRE_MINUTES))

    features = get_organization_features(db, org.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organization_id": org.id,
            "organization_name": org.name,
            "features": features,
            "impersonation": _impersonation_info(get_current_user_payload(access_token))
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
def logout(request: Request, response: Response, authorization: Optional[str] = Header(None), refresh_token: Optional[str] = Cookie(default=None), db: Session = Depends(get_db)):
    # 1. Revoke the access token and the refresh token (an expired or invalid one needs nothing)
    access_payload = None
    session_payload = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        access_payload = get_current_user_payload(token)
        if access_payload:
            blacklist_token(access_payload)
        # An expired token is still checked for being a support session
        session_payload = access_payload or decode_token_ignoring_expiry(token)

    # Support session ended (by the admin or by timing out): on record for the super admin.
    # The refresh cookie belongs to the browser's own workspace login, so it is left alone
    if session_payload and session_payload.get("impersonated_by") is not None:
        record_audit_log(
            db,
            action="IMPERSONATION_ENDED",
            category="security",
            actor_type="super_admin",
            actor_id=session_payload.get("impersonated_by"),
            actor_email=session_payload.get("impersonated_by_email"),
            target_type="user",
            target_name=session_payload.get("sub"),
            details={"organization_id": session_payload.get("organization_id"), "expired": access_payload is None},
            ip_address=get_client_ip(request),
            status="success",
        )
        return {"message": "Support session ended"}

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
    features = get_organization_features(db, org.id) if org else {}
    
    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organization_id": org.id if org else None,
            "organization_name": org.name if org else None,
            "features": features,
            "impersonation": _impersonation_info(payload),
            # AI settings "allowed roles for handover": may this member pick up / take over unassigned chats
            "can_handle_chats": user.role in handover_roles(db, user.organization_id),
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
