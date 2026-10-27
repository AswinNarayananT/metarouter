from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action = Column(String(80), index=True, nullable=False)        # e.g. "ORGANIZATION_STATUS_CHANGED", "ORGANIZATION_DELETED", "ORGANIZATION_CREATED"
    category = Column(String(50), index=True, nullable=False)      # "organization", "security", "access_control", "system"
    actor_type = Column(String(50), default="super_admin")        # "super_admin", "client_admin", "system"
    actor_id = Column(Integer, nullable=True)                      # ID of the super admin or user
    actor_email = Column(String(255), index=True, nullable=False)  # Email of the actor
    target_type = Column(String(50), nullable=True)               # "organization", "invitation", "user"
    target_id = Column(Integer, nullable=True)                     # ID of the target resource
    target_name = Column(String(255), nullable=True)               # Name or slug of the target resource
    details = Column(JSONB, nullable=True)                         # Diffs, metadata, parameters
    ip_address = Column(String(64), nullable=True)
    status = Column(String(20), default="success", nullable=False) # "success", "warning", "failure"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
