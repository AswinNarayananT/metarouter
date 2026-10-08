from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.admin_model import SuperAdmin
from app.schemas.auth_schema import SuperAdminLoginRequest, TokenResponse, SuperAdminResponse
from app.core.security import verify_password, create_access_token

# Only keep /admin here; /api/v1 will be handled in main.py
router = APIRouter(prefix="/admin", tags=["Super Admin Authentication"])

@router.post("/login", response_model=TokenResponse)
def super_admin_login(payload: SuperAdminLoginRequest, db: Session = Depends(get_db)):
    # 1. Query the Super Admin by email
    admin = db.query(SuperAdmin).filter(SuperAdmin.email == payload.email).first()
    
    # 2. Verify existence and password
    if not admin or not verify_password(payload.password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. Create JWT access token embedding the sub and role
    access_token_payload = {
        "sub": admin.email,
        "role": "super_admin",
        "admin_id": admin.id
    }
    access_token = create_access_token(data=access_token_payload)
    
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