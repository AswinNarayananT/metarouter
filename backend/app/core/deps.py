from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import decode_access_token
from app.models.admin_model import SuperAdmin

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