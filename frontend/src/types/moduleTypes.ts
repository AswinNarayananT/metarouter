export interface PlatformModule {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  category: string;
  icon: string;
  is_active: boolean;
  default_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateModulePayload {
  key: string;
  name: string;
  description?: string;
  category: string;
  icon: string;
  is_active: boolean;
  default_enabled: boolean;
}

export interface UpdateModulePayload {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  is_active?: boolean;
  default_enabled?: boolean;
}

export interface OrganizationFeatureItem {
  key: string;
  name: string;
  description?: string | null;
  category: string;
  icon: string;
  is_active_globally: boolean;
  default_enabled: boolean;
  enabled_for_workspace: boolean;
  is_custom_override: boolean;
}

export interface OrganizationFeaturesResponse {
  organization_id: number;
  organization_name: string;
  features: Record<string, boolean>;
  modules: OrganizationFeatureItem[];
}
