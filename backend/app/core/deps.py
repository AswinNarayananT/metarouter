from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import PyJWTError
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.core.security import decode_access_token
from app.models.admin_model import SuperAdmin
from app.models.organization_model import User
from app.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")

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
    
    if email is None or role != "super_admin":
        raise credentials_exception
        
    admin = db.query(SuperAdmin).filter(SuperAdmin.email == email).first()
    if admin is None:
        raise credentials_exception
        
    return admin

def get_current_tenant_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency to authenticate and retrieve the current active tenant user using PyJWT.
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

    # Query Database for Tenant User
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

    return user