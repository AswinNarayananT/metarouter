export interface AdminUserPublic {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string | null;
}

export interface OrganizationListItem {
  id: number;
  name: string;
  slug: string;
  subscription_status: string;
  created_at?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  admin_name?: string | null;
  admin_email?: string | null;
  user_count: number;
}

export interface WhatsAppNumberDetail {
  id: number;
  phone_number_id: string;
  display_phone_number: string;
  waba_id?: string | null;
  verified_name?: string | null;
  quality_rating: string;
  messaging_tier: string;
  status: string; // 'connected' | 'disconnected'
  disconnected_at?: string | null;
  disconnect_reason?: string | null;
  disconnect_subcode?: number | null;
  created_at?: string | null;
}

export interface MonthlyMessageBreakdown {
  customer: number;
  ai: number;
  agent: number;
  total: number;
}

export interface OrganizationMetrics {
  messages_this_month: MonthlyMessageBreakdown;
  total_ai_replies: number;
  broadcasts_sent: number;
  broadcasts_completed: number;
  active_chats: number;
  total_chats: number;
  total_tickets: number;
  open_tickets: number;
  resolved_tickets: number;
  storage_used_bytes: number;
  last_activity?: string | null;
}

export interface OrganizationMemberPublic {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string | null;
}

export interface OrganizationDetail {
  id: number;
  name: string;
  slug: string;
  subscription_status: string;
  created_at?: string | null;
  support_email: string;
  support_phone: string;
  admin: AdminUserPublic | null;
  user_count: number;
  whatsapp_count: number;
  whatsapp_numbers?: WhatsAppNumberDetail[];
  members?: OrganizationMemberPublic[];
  metrics?: OrganizationMetrics | null;
}

export interface DisconnectedNumberItem {
  id: number;
  display_phone_number: string;
  organization_id: number;
  organization_name: string;
  organization_slug: string;
  disconnected_at?: string | null;
  disconnect_reason?: string | null;
  disconnect_subcode?: number | null;
}

export interface StuckTasksBreakdown {
  total_stuck: number;
  stuck_messages: number;
  stuck_documents: number;
  stuck_attachments: number;
  stalled_broadcasts: number;
}

export interface DashboardStats {
  organization_count: number;
  active_organization_count: number;
  user_count: number;
  whatsapp_count: number;
  recent_organizations: OrganizationListItem[];
  disconnected_numbers_count: number;
  disconnected_numbers: DisconnectedNumberItem[];
  failed_messages_24h: number;
  gemini_errors_24h: number;
  stuck_tasks_count: number;
  stuck_tasks: StuckTasksBreakdown;
}

export interface PaginatedOrganizations {
  items: OrganizationListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface FetchOrganizationsParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
}

export interface OrganizationInvitation {
  id: number;
  email: string;
  organization_name?: string | null;
  expires_at: string;      // The link itself is only emailed to the admin (the server keeps just a hash)
  is_used: boolean;
  created_at?: string | null;
}

export interface CreateOrganizationInvitePayload {
  email: string;
  organization_name?: string;
  expires_in_days?: number;
}

export interface VerifyOrganizationInviteResponse {
  valid: boolean;
  email: string;
  organization_name?: string | null;
  expires_at: string;
}

export interface CompleteOrganizationOnboardingPayload {
  token: string;
  admin_name: string;
  admin_password: string;
  organization_name: string;
  slug?: string;
  support_email?: string;
  support_phone?: string;
}

export interface CompleteOrganizationOnboardingResponse {
  message: string;
  organization_id: number;
  organization_name: string;
  slug: string;
  admin_email: string;
}

