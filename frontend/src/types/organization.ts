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
}

export interface OrganizationCreateResponse extends OrganizationDetail {
  admin_password: string;
}

export interface OrganizationCreatePayload {
  name: string;
  slug?: string;
  support_email: string;
  support_phone: string;
  subscription_status?: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
}

export interface DashboardStats {
  organization_count: number;
  active_organization_count: number;
  user_count: number;
  whatsapp_count: number;
  recent_organizations: OrganizationListItem[];
}
