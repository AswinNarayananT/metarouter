from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_workspace_user
from app.models.organization_model import Organization, User
from app.schemas.workspace_schema import TeamMemberResponse
from app.schemas.auth_schema import UpdateNameRequest
from app.core.features import require_feature

router = APIRouter(prefix="/organizations", tags=["Organizations"])

@router.get("/current", response_model=dict)
def get_current_organization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    """
    Fetch organization details for the currently logged-in workspace user.
    """
    if not current_user.organization_id:
        print("cu")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any workspace"
        )
        
    organization = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )
        
    from app.core.features import get_organization_features
    features = get_organization_features(db, organization.id)

    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "created_at": organization.created_at,
        "features": features,
    }


@router.get("/members", response_model=List[TeamMemberResponse])
def list_organization_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
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


@router.patch("/current", response_model=dict, dependencies=[Depends(require_feature("settings"))])
def update_current_organization(
    payload: UpdateNameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    """
    Rename the current user's organization (admin only).
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can update the workspace")

    organization = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    organization.name = payload.name
    db.commit()
    db.refresh(organization)

    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "created_at": organization.created_at
    }
