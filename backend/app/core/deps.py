from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import PyJWTError
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.core.security import decode_access_token
from app.core.token_blacklist import is_token_revoked
from app.models.admin_model import SuperAdmin
from app.models.organization_model import Organization, User
from app.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")

WORKSPACE_SUSPENDED_ERROR = "This workspace is suspended. Contact support to restore access."

def get_current_super_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> SuperAdmin:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    email: str = payload.get("sub")
    role: str = payload.get("role")
    admin_id = payload.get("admin_id")

    # Only tokens from the super admin login: they carry admin_id and never an organization_id
    # (a workspace token can never pass here, whatever role or email it carries)
    if email is None or role != "super_admin" or admin_id is None or payload.get("organization_id") is not None or payload.get("type", "access") != "access":
        raise credentials_exception

    # Logged out
    if is_token_revoked(payload):
        raise credentials_exception

    admin = db.query(SuperAdmin).filter(SuperAdmin.id == admin_id, SuperAdmin.email == email).first()
    if admin is None:
        raise credentials_exception

    return admin

def get_current_workspace_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency to authenticate and retrieve the current active workspace user using PyJWT.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or session expired",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode JWT Token using PyJWT (jwt)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: Optional[str] = payload.get("sub")
        organization_id: Optional[int] = payload.get("organization_id")
        token_type: Optional[str] = payload.get("type", "access")

        if email is None or organization_id is None:
            raise credentials_exception

        if token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type for endpoint access",
                headers={"WWW-Authenticate": "Bearer"},
            )

    except PyJWTError:
        raise credentials_exception

    # Logged out
    if is_token_revoked(payload):
        raise credentials_exception

    # Query Database for Workspace User
    user = db.query(User).filter(
        User.email == email,
        User.organization_id == organization_id
    ).first()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    # Tokens issued before the last password change are no longer valid
    if not token_issued_after_reset(payload, user):
        raise credentials_exception

    # A suspended workspace can't use the API
    ensure_workspace_active(db, user.organization_id)

    return user


def token_issued_after_reset(payload: dict, user: User) -> bool:
    if not user.tokens_valid_after:
        return True
    issued_at = payload.get("iat")
    return issued_at is not None and issued_at >= int(user.tokens_valid_after.timestamp())


def ensure_workspace_active(db: Session, organization_id: int) -> Organization:
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if organization.subscription_status != "active":
        raise HTTPException(status_code=403, detail=WORKSPACE_SUSPENDED_ERROR)
    return organization