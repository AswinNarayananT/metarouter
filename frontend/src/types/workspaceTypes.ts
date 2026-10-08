export interface WorkspaceUser {
  id: number;
  name: string;
  email: string;
  role: string;
  organization_name: string;
}

export interface WorkspaceState {
  user: WorkspaceUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  org_slug: string;
}