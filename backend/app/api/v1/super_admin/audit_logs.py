import csv
import io
import math
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from app.database import get_db
from app.core.deps import get_current_super_admin
from app.models.admin_model import SuperAdmin
from app.models.audit_log_model import AuditLog
from app.schemas.audit_log_schema import (
    AuditLogItem,
    AuditLogSummary,
    PaginatedAuditLogsResponse,
)

router = APIRouter(
    prefix="/superadmin/audit-logs",
    tags=["Super Admin Audit Logs"],
    dependencies=[Depends(get_current_super_admin)],
)


@router.get("", response_model=PaginatedAuditLogsResponse)
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    query = db.query(AuditLog)

    # Filter by category
    if category and category.lower() != "all":
        query = query.filter(AuditLog.category == category.lower())

    # Filter by status
    if status and status.lower() != "all":
        query = query.filter(AuditLog.status == status.lower())

    # Search filter across actor email, target name, and action
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AuditLog.actor_email.ilike(term),
                AuditLog.target_name.ilike(term),
                AuditLog.action.ilike(term),
            )
        )

    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))

    logs = (
        query
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Compute high-level summary metrics for the audit dashboard
    total_events = db.query(func.count(AuditLog.id)).scalar() or 0
    org_events = db.query(func.count(AuditLog.id)).filter(AuditLog.category == "organization").scalar() or 0
    security_events = db.query(func.count(AuditLog.id)).filter(AuditLog.category == "security").scalar() or 0
    critical_events = (
        db.query(func.count(AuditLog.id))
        .filter(
            or_(
                AuditLog.action.ilike("%DELETED%"),
                AuditLog.action.ilike("%REVOKED%"),
                AuditLog.status.in_(["warning", "failure"]),
            )
        )
        .scalar()
        or 0
    )

    summary = AuditLogSummary(
        total_events=total_events,
        org_events=org_events,
        security_events=security_events,
        critical_events=critical_events,
    )

    return PaginatedAuditLogsResponse(
        items=[AuditLogItem.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        summary=summary,
    )


def _safe_cell(value):
    # Values from clients (workspace names, emails) could start with = + - @ and run as a formula in Excel:
    # a leading apostrophe makes the spreadsheet show them as plain text
    text = str(value)
    return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else value


@router.get("/export")
def export_audit_logs_csv(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    query = db.query(AuditLog)

    if category and category.lower() != "all":
        query = query.filter(AuditLog.category == category.lower())

    if status and status.lower() != "all":
        query = query.filter(AuditLog.status == status.lower())

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AuditLog.actor_email.ilike(term),
                AuditLog.target_name.ilike(term),
                AuditLog.action.ilike(term),
            )
        )

    logs = query.order_by(AuditLog.created_at.desc()).limit(1000).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID",
        "Timestamp (UTC)",
        "Action",
        "Category",
        "Actor Type",
        "Actor Email",
        "Target Type",
        "Target Name",
        "Status",
        "IP Address",
        "Details",
    ])

    for log in logs:
        writer.writerow([_safe_cell(value) for value in [
            log.id,
            log.created_at.isoformat() if log.created_at else "",
            log.action,
            log.category,
            log.actor_type,
            log.actor_email,
            log.target_type or "",
            log.target_name or "",
            log.status,
            log.ip_address or "",
            str(log.details or ""),
        ]])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=metarouter_audit_logs.csv"},
    )
