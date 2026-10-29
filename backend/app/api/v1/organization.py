import math
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.config import settings
from app.core.deps import get_db, get_current_workspace_user, MEMBER_REMOVED_ERROR
from app.core.security import verify_password
from app.core.login_guard import check_login_allowed, record_failed_login, clear_failed_logins
from app.models.organization_model import Organization, User
from app.schemas.workspace_schema import TeamMemberResponse, PaginatedTeamMembersResponse, UpdateMemberRoleRequest, RemoveMemberRequest, MemberOpenWorkResponse, LeaveWorkspaceRequest
from app.schemas.auth_schema import UpdateNameRequest
from app.core.features import require_feature
from app.services.notification_service import notify_role_changed, notify_member_left
from app.services.member_service import archive_member, assigned_chats_query, assigned_tickets_query, other_active_admins, MEMBER_LEFT_MESSAGE
from app.services.audit_service import record_audit_log, get_client_ip

router = APIRouter(prefix="/organizations", tags=["Organizations"])

RESTORE_EMAIL_TAKEN = "This email now belongs to another workspace, so this member can't be restored."

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
    status_filter: Literal["current", "removed"] = Query("current", alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_workspace_user)
):
    """
    List the team members in the current user's organization (removed members only with ?status=removed).
    """
    query = db.query(User).filter(User.organization_id == current_user.organization_id)

    if status_filter == "removed":
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only workspace administrators can view removed members")
        return query.filter(User.removed_at != None).order_by(User.removed_at.desc()).all()

    return query.filter(User.removed_at == None).order_by(User.created_at.asc()).all()


@router.get("/members/page", response_model=PaginatedTeamMembersResponse)
def list_organization_members_page(status_filter: Literal["current", "removed"] = Query("current", alias="status"), search: Optional[str] = Query(None, max_length=100), page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100), db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Team Members page: one tab at a time, searched and paginated (the full /members list feeds the assign dropdowns)
    # 1. Removed members are admin only
    is_admin = current_user.role == "admin"
    if status_filter == "removed" and not is_admin:
        raise HTTPException(status_code=403, detail="Only workspace administrators can view removed members")

    members = db.query(User).filter(User.organization_id == current_user.organization_id)
    current_members = members.filter(User.removed_at == None)
    removed_members = members.filter(User.removed_at != None)

    # 2. The tab, then the search on name or email
    query = removed_members if status_filter == "removed" else current_members
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(User.name.ilike(term), User.email.ilike(term)))

    # 3. Current: you first, then admins, managers and service by name; removed: most recent first
    if status_filter == "removed":
        query = query.order_by(User.removed_at.desc(), User.id.desc())
    else:
        role_rank = case((User.role == "admin", 0), (User.role == "manager", 1), else_=2)
        query = query.order_by(case((User.id == current_user.id, 0), else_=1), role_rank, func.lower(User.name), User.id)

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
        "current_count": current_members.count(),
        "removed_count": removed_members.count() if is_admin else 0
    }


@router.get("/members/me/open-work", response_model=MemberOpenWorkResponse)
def get_my_open_work(db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # Shown in the leave dialog: what goes back to the unassigned queue
    return {
        "open_chats": assigned_chats_query(db, current_user).count(),
        "open_tickets": assigned_tickets_query(db, current_user).count()
    }


@router.post("/members/me/leave")
def leave_workspace(payload: LeaveWorkspaceRequest, request: Request, response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Confirm it's really them (an unlocked laptop can't do it); wrong guesses count like failed logins
    check_login_allowed("workspace", current_user.email, request)
    if not verify_password(payload.password, current_user.hashed_password):
        record_failed_login("workspace", current_user.email, request)
        raise HTTPException(status_code=400, detail="Incorrect password. Please try again.")
    clear_failed_logins("workspace", current_user.email, request)

    # 2. The workspace always keeps an active admin
    if current_user.role == "admin" and other_active_admins(db, current_user) == 0:
        raise HTTPException(status_code=400, detail="You're the only admin. Make someone else an admin before you leave.")

    # 3. Their chats and tickets go back to the unassigned queue; the account is archived and signed out everywhere
    open_chats = archive_member(db, current_user, current_user, None, "left", MEMBER_LEFT_MESSAGE)

    # 4. Admins and managers are told, so the chats in the queue get picked up
    notify_member_left(db, current_user, open_chats)

    record_audit_log(
        db,
        action="MEMBER_LEFT",
        category="access_control",
        actor_email=current_user.email,
        actor_type="user",
        actor_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
        target_name=current_user.email,
        details={"organization_id": current_user.organization_id, "open_chats": open_chats},
        ip_address=get_client_ip(request)
    )

    # 5. The refresh cookie is useless now (sessions ended); clear it so the browser starts clean
    response.delete_cookie(key="refresh_token", httponly=True, secure=settings.COOKIE_SECURE, samesite="lax")

    return {"message": MEMBER_LEFT_MESSAGE}


@router.patch("/members/{user_id}/role", response_model=TeamMemberResponse)
def update_member_role(user_id: int, payload: UpdateMemberRoleRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can change roles")

    # 2. Locate the member strictly within this organization
    member = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
        User.removed_at == None
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")

    # 3. Never your own role (so the admin making changes always stays an admin)
    if member.id == current_user.id:
        raise HTTPException(status_code=403, detail="You can't change your own role. Ask another admin.")

    # 4. The workspace always keeps an active admin
    if member.role == "admin" and payload.role != "admin":
        other_admins = db.query(User.id).filter(
            User.organization_id == current_user.organization_id,
            User.role == "admin",
            User.is_active == True,
            User.id != member.id
        ).count()
        if other_admins == 0:
            raise HTTPException(status_code=400, detail="The workspace needs at least one active admin")

    # Nothing to change
    if member.role == payload.role:
        return member

    # 5. Save; the new permissions apply on their next request (roles are read from the database), and they're told
    member.role = payload.role
    db.commit()
    db.refresh(member)
    notify_role_changed(db, member, current_user, payload.role)

    return member


@router.get("/members/{user_id}/open-work", response_model=MemberOpenWorkResponse)
def get_member_open_work(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only (shown in the remove dialog)
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can remove members")

    # 2. Locate the member strictly within this organization
    member = _find_current_member(db, user_id, current_user.organization_id)

    # 3. What would need a new owner
    return {
        "open_chats": assigned_chats_query(db, member).count(),
        "open_tickets": assigned_tickets_query(db, member).count()
    }


@router.post("/members/{user_id}/remove", response_model=TeamMemberResponse)
def remove_member(user_id: int, payload: RemoveMemberRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can remove members")

    # 2. Locate the member strictly within this organization
    member = _find_current_member(db, user_id, current_user.organization_id)

    # 3. Never yourself, and the workspace always keeps an active admin
    if member.id == current_user.id:
        raise HTTPException(status_code=403, detail="You can't remove yourself. Ask another admin.")

    if member.role == "admin" and other_active_admins(db, member) == 0:
        raise HTTPException(status_code=400, detail="The workspace needs at least one active admin")

    # 4. The new owner of their open work must be another active member here
    new_owner = None
    if payload.reassign_to_user_id is not None:
        new_owner = db.query(User).filter(
            User.id == payload.reassign_to_user_id,
            User.organization_id == current_user.organization_id,
            User.is_active == True,
            User.removed_at == None
        ).first()
        if not new_owner or new_owner.id == member.id:
            raise HTTPException(status_code=400, detail="Choose an active member to take over their chats")

    # 5. Hand over their work, archive the account and sign them out everywhere
    archive_member(db, member, current_user, new_owner, "removed", MEMBER_REMOVED_ERROR)

    record_audit_log(
        db,
        action="MEMBER_REMOVED",
        category="access_control",
        actor_email=current_user.email,
        actor_type="user",
        actor_id=current_user.id,
        target_type="user",
        target_id=member.id,
        target_name=member.email,
        details={"organization_id": current_user.organization_id, "reassigned_to": new_owner.email if new_owner else None},
        ip_address=get_client_ip(request)
    )

    return member


@router.post("/members/{user_id}/restore", response_model=TeamMemberResponse)
def restore_member(user_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_workspace_user)):
    # 1. Admins only
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace administrators can restore members")

    # 2. Locate the removed member strictly within this organization
    member = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
        User.removed_at != None
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Removed member not found")

    # 3. The email may have joined a workspace since (one workspace per email; the other one is never named)
    email_taken = db.query(User.id).filter(func.lower(User.email) == member.email.lower(), User.removed_at == None).first()
    if email_taken:
        raise HTTPException(status_code=409, detail=RESTORE_EMAIL_TAKEN)

    # 4. Same account back: role, password and history (sessions from before the removal stay ended).
    #    If they joined elsewhere at this same moment, the one-current-account-per-email index refuses it
    member.is_active = True
    member.removed_at = None
    member.removal_type = None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=RESTORE_EMAIL_TAKEN)
    db.refresh(member)

    record_audit_log(
        db,
        action="MEMBER_RESTORED",
        category="access_control",
        actor_email=current_user.email,
        actor_type="user",
        actor_id=current_user.id,
        target_type="user",
        target_id=member.id,
        target_name=member.email,
        details={"organization_id": current_user.organization_id},
        ip_address=get_client_ip(request)
    )

    return member


def _find_current_member(db: Session, user_id: int, organization_id: int) -> User:
    member = db.query(User).filter(
        User.id == user_id,
        User.organization_id == organization_id,
        User.removed_at == None
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    return member


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
