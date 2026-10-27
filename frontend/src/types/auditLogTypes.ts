export type AuditLogCategory = 'all' | 'organization' | 'security' | 'access_control' | 'gateway';
export type AuditLogStatus = 'all' | 'success' | 'warning' | 'failure' | 'critical';

export interface AuditLogItem {
  id: number;
  action: string;
  category: string;
  actor_type: string;
  actor_id?: number | null;
  actor_email: string;
  target_type?: string | null;
  target_id?: number | null;
  target_name?: string | null;
  details?: Record<string, unknown> | null; // Free-form JSON recorded with the event
  ip_address?: string | null;
  status: string;
  created_at: string;
}

export interface AuditLogSummary {
  total_events: number;
  org_events: number;
  security_events: number;
  critical_events: number;
}

export interface PaginatedAuditLogsResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: AuditLogSummary;
}

export interface FetchAuditLogsParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  status?: string;
}
