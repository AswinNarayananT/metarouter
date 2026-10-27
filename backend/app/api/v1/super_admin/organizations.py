import math
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from app.database import get_db
from app.config import settings
from app.core.deps import get_current_super_admin
from app.core.security import hash_invite_token
from app.services.audit_service import record_audit_log, get_client_ip
from app.services.whatsapp_service import deregister_phone_number, unsubscribe_app_from_waba, WhatsAppRetryableError, WhatsAppPermanentError, WhatsAppTokenError
from app.models.admin_model import SuperAdmin
from app.models.organization_model import Organization, OrganizationProfile, User
from app.models.organization_invitation_model import OrganizationInvitation
from app.models.whatsapp_model import WhatsAppNumber
from app.models.conversation_model import Conversation, ChatMessage, ConversationStatus, MessageStatus
from app.models.broadcast_model import Broadcast
from app.models.ticket_model import Ticket
from app.models.attachment_model import ChatAttachment
from app.models.knowledge_model import KnowledgeDocument
from app.schemas.organization_schema import (
    OrganizationDetail,
    OrganizationListItem,
    DashboardStats,
    UpdateStatusRequest,
    PaginatedOrganizationsResponse,
    WhatsAppNumberDetail,
    MonthlyMessageBreakdown,
    OrganizationMetrics,
    OrganizationMemberPublic,
    DisconnectedNumberItem,
    StuckTasksBreakdown,
    OrganizationInviteCreateRequest,
    OrganizationInviteResponse,
)

router = APIRouter(
    prefix="/superadmin/organizations",
    tags=["Super Admin Organizations"],
    dependencies=[Depends(get_current_super_admin)],
)


@router.get("/stats", response_model=DashboardStats)
def organization_stats(db: Session = Depends(get_db), _: SuperAdmin = Depends(get_current_super_admin)):
    now = datetime.now(timezone.utc)
    since_24h_naive = (now - timedelta(hours=24)).replace(tzinfo=None)

    org_count = db.query(func.count(Organization.id)).scalar() or 0
    active_count = (
        db.query(func.count(Organization.id))
        .filter(Organization.subscription_status == "active")
        .scalar()
        or 0
    )
    user_count = db.query(func.count(User.id)).scalar() or 0
    whatsapp_count = db.query(func.count(WhatsAppNumber.id)).scalar() or 0

    # 1. Numbers disconnected across all workspaces
    disconnected_rows = (
        db.query(WhatsAppNumber, Organization)
        .join(Organization, WhatsAppNumber.organization_id == Organization.id)
        .filter(WhatsAppNumber.status == "disconnected")
        .order_by(WhatsAppNumber.disconnected_at.desc().nullslast())
        .all()
    )
    disconnected_numbers = [
        DisconnectedNumberItem(
            id=num.id,
            display_phone_number=num.display_phone_number,
            organization_id=org.id,
            organization_name=org.name,
            organization_slug=org.slug,
            disconnected_at=_to_utc_aware(num.disconnected_at),
            disconnect_reason=num.disconnect_reason,
            disconnect_subcode=num.disconnect_subcode,
        )
        for num, org in disconnected_rows
    ]
    disconnected_count = len(disconnected_numbers)

    # 2. Failed messages in the last 24 h
    failed_messages_24h = (
        db.query(func.count(ChatMessage.id))
        .filter(
            or_(
                ChatMessage.status == MessageStatus.FAILED,
                ChatMessage.error.isnot(None),
            ),
            ChatMessage.created_at >= since_24h_naive,
        )
        .scalar()
        or 0
    )

    # 3. Gemini errors and fallbacks in the last 24 h
    gemini_errors_24h = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.sender == "model",
            or_(
                ChatMessage.content.ilike("%trouble processing%"),
                ChatMessage.content.ilike("%Someone will reply shortly%"),
                ChatMessage.content.ilike("%[ESCALATE_TO_HUMAN]%"),
                ChatMessage.error.isnot(None),
                ChatMessage.status == MessageStatus.FAILED,
            ),
            ChatMessage.created_at >= since_24h_naive,
        )
        .scalar()
        or 0
    )

    # 4. Stuck background tasks across the platform
    stuck_before = (now - timedelta(minutes=5)).replace(tzinfo=None)
    stuck_msgs = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.status == MessageStatus.PENDING,
            ChatMessage.created_at < stuck_before,
        )
        .scalar()
        or 0
    )
    stuck_docs = (
        db.query(func.count(KnowledgeDocument.id))
        .filter(
            KnowledgeDocument.status == "processing",
            KnowledgeDocument.processing_started_at < now - timedelta(minutes=5),
        )
        .scalar()
        or 0
    )
    stuck_attachments = (
        db.query(func.count(ChatAttachment.id))
        .filter(
            ChatAttachment.created_at < now - timedelta(minutes=5),
            or_(
                ChatAttachment.download_status == "pending",
                (ChatAttachment.download_status == "done") & (ChatAttachment.parse_status == "pending"),
            ),
        )
        .scalar()
        or 0
    )
    stalled_broadcasts = (
        db.query(func.count(Broadcast.id))
        .filter(
            Broadcast.status.in_(["queued", "sending"]),
            Broadcast.created_at < now - timedelta(minutes=15),
        )
        .scalar()
        or 0
    )

    stuck_breakdown = StuckTasksBreakdown(
        total_stuck=stuck_msgs + stuck_docs + stuck_attachments + stalled_broadcasts,
        stuck_messages=stuck_msgs,
        stuck_documents=stuck_docs,
        stuck_attachments=stuck_attachments,
        stalled_broadcasts=stalled_broadcasts,
    )

    recent = (
        db.query(Organization)
        .options(joinedload(Organization.profile), joinedload(Organization.users))
        .order_by(Organization.created_at.desc())
        .limit(5)
        .all()
    )

    return DashboardStats(
        organization_count=org_count,
        active_organization_count=active_count,
        user_count=user_count,
        whatsapp_count=whatsapp_count,
        recent_organizations=[OrganizationListItem.from_orm_custom(org) for org in recent],
        disconnected_numbers_count=disconnected_count,
        disconnected_numbers=disconnected_numbers,
        failed_messages_24h=failed_messages_24h,
        gemini_errors_24h=gemini_errors_24h,
        stuck_tasks_count=stuck_breakdown.total_stuck,
        stuck_tasks=stuck_breakdown,
    )


@router.get("", response_model=PaginatedOrganizationsResponse)
def list_organizations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    query = db.query(Organization)

    # Filter by subscription status: active or inactive
    if status and status.lower() in ("active", "inactive"):
        query = query.filter(Organization.subscription_status == status.lower())

    # Search filter across organization name, slug, support email, or user name/email
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Organization.name.ilike(term),
                Organization.slug.ilike(term),
                Organization.id.in_(
                    db.query(OrganizationProfile.organization_id).filter(
                        OrganizationProfile.support_email.ilike(term)
                    )
                ),
                Organization.id.in_(
                    db.query(User.organization_id).filter(
                        or_(
                            User.name.ilike(term),
                            User.email.ilike(term)
                        )
                    )
                )
            )
        )

    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))

    orgs = (
        query
        .options(joinedload(Organization.profile), joinedload(Organization.users))
        .order_by(Organization.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedOrganizationsResponse(
        items=[OrganizationListItem.from_orm_custom(org) for org in orgs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.post("/invitations", response_model=OrganizationInviteResponse, status_code=status.HTTP_201_CREATED)
def create_organization_invitation(
    payload: OrganizationInviteCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin),
):
    email = payload.email.lower().strip()

    # Check if email belongs to super admin
    if db.query(SuperAdmin.id).filter(func.lower(SuperAdmin.email) == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super admin email cannot be invited as a workspace admin"
        )

    # Check if already a registered user in any workspace
    if db.query(User.id).filter(func.lower(User.email) == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists"
        )

    # Check for an active unused invitation to avoid duplicate active links
    existing_invite = (
        db.query(OrganizationInvitation)
        .filter(
            func.lower(OrganizationInvitation.email) == email,
            OrganizationInvitation.is_used == False,
            OrganizationInvitation.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if existing_invite:
        # Resend: a fresh link (only its hash is stored, so the old one can't be sent again and stops working)
        token = secrets.token_urlsafe(32)
        existing_invite.token = hash_invite_token(token)
        existing_invite.expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)
        if payload.organization_name:
            existing_invite.organization_name = payload.organization_name.strip()
        db.commit()
        db.refresh(existing_invite)

        # Dispatch background email task via Celery
        try:
            from app.workers.tasks.email_tasks import send_organization_onboarding_email_task
            send_organization_onboarding_email_task.delay(
                to_email=existing_invite.email,
                org_name=existing_invite.organization_name,
                invite_link=f"{settings.FRONTEND_BASE_URL}/onboard#token={token}",
                expires_days=payload.expires_in_days,
            )
        except Exception as e:
            print(f"[SUPERADMIN] Background email dispatch error: {e}")

        record_audit_log(
            db,
            action="ORGANIZATION_INVITATION_RESENT",
            category="access_control",
            actor_type="super_admin",
            actor_id=current_admin.id,
            actor_email=current_admin.email,
            target_type="invitation",
            target_id=existing_invite.id,
            target_name=existing_invite.organization_name or existing_invite.email,
            details={"email": existing_invite.email, "organization_name": existing_invite.organization_name, "expires_in_days": payload.expires_in_days},
            ip_address=get_client_ip(request),
            status="success",
        )

        return OrganizationInviteResponse(
            id=existing_invite.id,
            email=existing_invite.email,
            organization_name=existing_invite.organization_name,
                expires_at=existing_invite.expires_at,
            is_used=existing_invite.is_used,
            created_at=existing_invite.created_at,
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)
    invitation = OrganizationInvitation(
        email=email,
        organization_name=payload.organization_name.strip() if payload.organization_name else None,
        token=hash_invite_token(token),
        expires_at=expires_at,
        is_used=False,
        created_by_id=current_admin.id,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    # Dispatch background email task via Celery
    try:
        from app.workers.tasks.email_tasks import send_organization_onboarding_email_task
        send_organization_onboarding_email_task.delay(
            to_email=invitation.email,
            org_name=invitation.organization_name,
            invite_link=f"{settings.FRONTEND_BASE_URL}/onboard#token={token}",
            expires_days=payload.expires_in_days,
        )
    except Exception as e:
        print(f"[SUPERADMIN] Background email dispatch error: {e}")

    record_audit_log(
        db,
        action="ORGANIZATION_INVITED",
        category="access_control",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="invitation",
        target_id=invitation.id,
        target_name=invitation.organization_name or invitation.email,
        details={"email": invitation.email, "organization_name": invitation.organization_name, "expires_in_days": payload.expires_in_days},
        ip_address=get_client_ip(request),
        status="success",
    )

    return OrganizationInviteResponse(
        id=invitation.id,
        email=invitation.email,
        organization_name=invitation.organization_name,
        expires_at=invitation.expires_at,
        is_used=invitation.is_used,
        created_at=invitation.created_at,
    )



@router.get("/invitations", response_model=List[OrganizationInviteResponse])
def list_organization_invitations(
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    invites = (
        db.query(OrganizationInvitation)
        .order_by(OrganizationInvitation.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        OrganizationInviteResponse(
            id=inv.id,
            email=inv.email,
            organization_name=inv.organization_name,
            expires_at=inv.expires_at,
            is_used=inv.is_used,
            created_at=inv.created_at,
        )
        for inv in invites
    ]


@router.delete("/invitations/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_organization_invitation(
    invite_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin),
):
    invite = db.query(OrganizationInvitation).filter(OrganizationInvitation.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    
    target_email = invite.email
    target_org = invite.organization_name

    db.delete(invite)
    db.commit()

    record_audit_log(
        db,
        action="INVITATION_REVOKED",
        category="access_control",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="invitation",
        target_id=invite_id,
        target_name=target_email,
        details={"email": target_email, "organization_name": target_org},
        ip_address=get_client_ip(request),
        status="warning",
    )
    return None


def _to_utc_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_organization_metrics(db: Session, organization_id: int) -> OrganizationMetrics:
    now = datetime.now(timezone.utc)
    start_of_month_naive = datetime(now.year, now.month, 1)

    # 1. Messages this month by sender
    message_counts = (
        db.query(ChatMessage.sender, func.count(ChatMessage.id))
        .join(Conversation, ChatMessage.conversation_id == Conversation.id)
        .filter(
            Conversation.organization_id == organization_id,
            ChatMessage.created_at >= start_of_month_naive,
        )
        .group_by(ChatMessage.sender)
        .all()
    )
    counts_dict = dict(message_counts)
    customer_count = counts_dict.get("user", 0)
    ai_count = counts_dict.get("model", 0)
    agent_count = counts_dict.get("human", 0)
    total_month_messages = sum(counts_dict.values())

    # 2. Total AI replies (all time)
    total_ai_replies = (
        db.query(func.count(ChatMessage.id))
        .join(Conversation, ChatMessage.conversation_id == Conversation.id)
        .filter(
            Conversation.organization_id == organization_id,
            ChatMessage.sender == "model",
        )
        .scalar()
        or 0
    )

    # 3. Broadcasts
    total_broadcasts = (
        db.query(func.count(Broadcast.id))
        .filter(Broadcast.organization_id == organization_id)
        .scalar()
        or 0
    )
    completed_broadcasts = (
        db.query(func.count(Broadcast.id))
        .filter(
            Broadcast.organization_id == organization_id,
            Broadcast.status == "completed",
        )
        .scalar()
        or 0
    )

    # 4. Chats
    active_chats = (
        db.query(func.count(Conversation.id))
        .filter(
            Conversation.organization_id == organization_id,
            Conversation.status == ConversationStatus.ACTIVE,
        )
        .scalar()
        or 0
    )
    total_chats = (
        db.query(func.count(Conversation.id))
        .filter(Conversation.organization_id == organization_id)
        .scalar()
        or 0
    )

    # 5. Tickets
    total_tickets = (
        db.query(func.count(Ticket.id))
        .filter(Ticket.organization_id == organization_id)
        .scalar()
        or 0
    )
    open_tickets = (
        db.query(func.count(Ticket.id))
        .filter(
            Ticket.organization_id == organization_id,
            Ticket.status != "closed",
        )
        .scalar()
        or 0
    )
    resolved_tickets = (
        db.query(func.count(Ticket.id))
        .filter(
            Ticket.organization_id == organization_id,
            Ticket.status == "closed",
        )
        .scalar()
        or 0
    )

    # 6. Storage (chat attachments + knowledge documents)
    attachment_bytes = (
        db.query(func.coalesce(func.sum(ChatAttachment.file_size), 0))
        .filter(ChatAttachment.organization_id == organization_id)
        .scalar()
        or 0
    )
    knowledge_bytes = (
        db.query(func.coalesce(func.sum(KnowledgeDocument.file_size), 0))
        .filter(KnowledgeDocument.organization_id == organization_id)
        .scalar()
        or 0
    )
    total_storage_bytes = int(attachment_bytes) + int(knowledge_bytes)

    # 7. Last activity timestamp
    last_message_at = (
        db.query(func.max(ChatMessage.created_at))
        .join(Conversation, ChatMessage.conversation_id == Conversation.id)
        .filter(Conversation.organization_id == organization_id)
        .scalar()
    )
    last_conversation_at = (
        db.query(func.max(Conversation.updated_at))
        .filter(Conversation.organization_id == organization_id)
        .scalar()
    )
    last_broadcast_at = (
        db.query(func.max(Broadcast.created_at))
        .filter(Broadcast.organization_id == organization_id)
        .scalar()
    )
    last_ticket_at = (
        db.query(func.max(Ticket.updated_at))
        .filter(Ticket.organization_id == organization_id)
        .scalar()
    )

    candidates = [last_message_at, last_conversation_at, last_broadcast_at, last_ticket_at]
    valid_candidates = [_to_utc_aware(c) for c in candidates if c is not None]
    last_activity = max(valid_candidates) if valid_candidates else None

    return OrganizationMetrics(
        messages_this_month=MonthlyMessageBreakdown(
            customer=customer_count,
            ai=ai_count,
            agent=agent_count,
            total=total_month_messages,
        ),
        total_ai_replies=total_ai_replies,
        broadcasts_sent=total_broadcasts,
        broadcasts_completed=completed_broadcasts,
        active_chats=active_chats,
        total_chats=total_chats,
        total_tickets=total_tickets,
        open_tickets=open_tickets,
        resolved_tickets=resolved_tickets,
        storage_used_bytes=total_storage_bytes,
        last_activity=last_activity,
    )


@router.get("/{organization_id}", response_model=OrganizationDetail)
def get_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    org = (
        db.query(Organization)
        .options(
            joinedload(Organization.profile),
            joinedload(Organization.users),
            joinedload(Organization.whatsapp_numbers),
        )
        .filter(Organization.id == organization_id)
        .first()
    )
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        
    metrics = compute_organization_metrics(db, organization_id)
    return OrganizationDetail.from_orm_custom(org, metrics=metrics)





@router.patch("/{org_id}/status")
def update_organization_status(
    org_id: int,
    payload: UpdateStatusRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin)
):
    # Find organization by ID
    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Update status (active or inactive, where inactive means suspended)
    organization.subscription_status = payload.subscription_status
    paused_broadcasts = 0
    if payload.subscription_status == "inactive":
        from app.services.broadcast_service import pause_workspace_broadcasts
        paused_broadcasts = pause_workspace_broadcasts(db, organization.id, reason="workspace_inactive")
        print(f"[SUPERADMIN] Workspace {organization.id} deactivated (suspended); paused {paused_broadcasts} broadcasts")
    db.commit()
    db.refresh(organization)

    record_audit_log(
        db,
        action="ORGANIZATION_STATUS_CHANGED",
        category="organization",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="organization",
        target_id=organization.id,
        target_name=organization.name,
        details={"new_status": payload.subscription_status, "paused_broadcasts": paused_broadcasts},
        ip_address=get_client_ip(request),
        status="warning" if payload.subscription_status == "inactive" else "success",
    )
    
    return {
        "message": f"Organization status updated to {payload.subscription_status} successfully",
        "id": organization.id,
        "name": organization.name,
        "subscription_status": organization.subscription_status,
        "paused_broadcasts": paused_broadcasts,
    }


@router.delete("/{organization_id}")
def delete_organization(
    organization_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: SuperAdmin = Depends(get_current_super_admin),
):
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    org_name = org.name
    org_slug = org.slug

    # 1. Tell Meta first, while the tokens still exist: stop this workspace's webhooks and switch its numbers
    #    off for the Cloud API (same as Disconnect in Channels). Meta errors are kept as warnings, never block the delete.
    warnings = []
    connected = db.query(WhatsAppNumber).filter(WhatsAppNumber.organization_id == organization_id, WhatsAppNumber.status == "connected").all()
    for waba_id in {n.waba_id for n in connected}:
        # Another workspace still using the same account keeps the webhook subscription
        shared = db.query(WhatsAppNumber.id).filter(WhatsAppNumber.waba_id == waba_id, WhatsAppNumber.organization_id != organization_id, WhatsAppNumber.status == "connected").first()
        if not shared:
            try:
                unsubscribe_app_from_waba(waba_id, next(n.access_token for n in connected if n.waba_id == waba_id))
            except (WhatsAppTokenError, WhatsAppPermanentError, WhatsAppRetryableError) as exc:
                warnings.append(f"unsubscribe {waba_id}: {exc}")
    for number in connected:
        try:
            deregister_phone_number(number.phone_number_id, number.access_token)
        except (WhatsAppTokenError, WhatsAppPermanentError, WhatsAppRetryableError) as exc:
            warnings.append(f"deregister {number.display_phone_number}: {exc}")

    # 2. Database deletion (Foreign key ON DELETE CASCADE cascades to all relational data):
    #    if it fails, the workspace's files are still there
    db.delete(org)
    db.commit()

    # 3. Then its files on disk: chat media and knowledge PDFs are stored under "org_<id>" folders
    try:
        from pathlib import Path
        import shutil

        for base in (settings.MEDIA_STORAGE_PATH, settings.KNOWLEDGE_STORAGE_PATH):
            if base:
                folder = Path(base) / f"org_{organization_id}"
                if folder.exists():
                    shutil.rmtree(folder, ignore_errors=True)
    except Exception as e:
        print(f"[SUPERADMIN] Storage file cleanup warning for org {organization_id}: {e}")

    record_audit_log(
        db,
        action="ORGANIZATION_DELETED",
        category="organization",
        actor_type="super_admin",
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        target_type="organization",
        target_id=organization_id,
        target_name=org_name,
        details={"slug": org_slug, "permanent_deletion": True, "numbers_disconnected": len(connected), "meta_warnings": warnings},
        ip_address=get_client_ip(request),
        status="critical",
    )

    return {
        "message": f"Organization '{org_name}' and all associated workspace data have been permanently deleted.",
        "id": organization_id,
        "name": org_name,
        "slug": org_slug,
        "numbers_disconnected": len(connected),
        "warnings": warnings,
    }