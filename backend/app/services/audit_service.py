import ipaddress
from typing import Optional, Any, Dict
from sqlalchemy.orm import Session
from fastapi import Request
from app.config import settings
from app.models.audit_log_model import AuditLog


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def get_client_ip(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    peer = request.client.host if request.client else None

    # X-Forwarded-For is written by the client, so it's only believed from a configured proxy
    trusted = {ip.strip() for ip in settings.TRUSTED_PROXY_IPS.split(",") if ip.strip()}
    if peer not in trusted:
        return peer

    # The proxy adds on the right: the last address that isn't a proxy of ours is who connected to it
    for value in reversed(request.headers.get("x-forwarded-for", "").split(",")):
        value = value.strip()
        if _is_ip(value) and value not in trusted:
            return value
    return peer


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
