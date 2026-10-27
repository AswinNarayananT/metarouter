from typing import Optional, Any, Dict
from sqlalchemy.orm import Session
from fastapi import Request
from app.models.audit_log_model import AuditLog


def get_client_ip(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    # Check X-Forwarded-For if behind proxy
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def record_audit_log(
    db: Session,
    action: str,
    category: str,
    actor_email: str,
    actor_type: str = "super_admin",
    actor_id: Optional[int] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    target_name: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    status: str = "success",
) -> AuditLog:
    """
    Persists an immutable audit log entry into the platform database.
    """
    try:
        log_entry = AuditLog(
            action=action,
            category=category,
            actor_type=actor_type,
            actor_id=actor_id,
            actor_email=actor_email,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            details=details,
            ip_address=ip_address,
            status=status,
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry
    except Exception as e:
        print(f"[AUDIT LOG] Error recording audit event {action}: {e}")
        # Never break primary operation if audit logging fails
        db.rollback()
        return None
