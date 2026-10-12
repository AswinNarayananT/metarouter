from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_tenant_user
from app.models.organization_model import Organization, User
from app.schemas.workspace_schema import TeamMemberResponse

router = APIRouter(prefix="/organizations", tags=["Organizations"])

@router.get("/current", response_model=dict)
def get_current_organization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user)
):
    """
    Fetch organization details for the currently logged-in tenant user.
    """
    if not current_user.organization_id:
        print("cu")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any organization"
        )
        
    organization = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
        
    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "created_at": organization.created_at
    }


@router.get("/members", response_model=List[TeamMemberResponse])
def list_organization_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user)
):
    """
    List all team members in the current user's organization.
    """
    return (
        db.query(User)
        .filter(User.organization_id == current_user.organization_id)
        .order_by(User.created_at.asc())
        .all()
    )
