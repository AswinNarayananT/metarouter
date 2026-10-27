from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, ConfigDict

class AuditLogItem(BaseModel):
    id: int
    action: str
    category: str
    actor_type: str
    actor_id: Optional[int] = None
    actor_email: str
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    target_name: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class AuditLogSummary(BaseModel):
    total_events: int = 0
    org_events: int = 0
    security_events: int = 0
    critical_events: int = 0

class PaginatedAuditLogsResponse(BaseModel):
    items: List[AuditLogItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: AuditLogSummary
