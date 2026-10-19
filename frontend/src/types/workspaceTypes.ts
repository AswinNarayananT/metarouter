export interface WorkspaceUser {
  id: number;
  name: string;
  email: string;
  role: string;
  organization_id:number;
  organization_name: string;
}

export interface CurrentOrganization {
  id: number;
  name: string;
  slug: string;
  created_at: string | null;
}

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface InvitationListItem {
  id: number;
  name: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string | null;
}

export interface PaginatedInvitations {
  items: InvitationListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface FetchInvitationsParams {
  page?: number;
  page_size?: number;
  status?: InvitationStatus;
}

export interface InvitePayloadItem {
  name: string;
  email: string;
  role: string;
}

export interface InvitationItemResult {
  name: string;
  email: string;
  role: string;
  invite_link: string;
}

export interface VerifyInvitationResponse {
  email: string;
  name: string;
  role: string;
  organization_name: string;
  org_slug: string;
}

export interface AcceptInvitationPayload {
  token: string;
  name: string;
  password: string;
}

export interface WorkspaceState {
  user: WorkspaceUser | null;
  token: string | null;
  organization: CurrentOrganization | null;
  isLoading: boolean;
  error: string | null;
  // Profile / Workspace settings save
  settingsSaveSuccess: boolean;
  settingsSaveError: string | null;
  isInviting: boolean;
  inviteSuccess: boolean;
  lastInvitations: InvitationItemResult[];
  // Invitation Verification and Onboarding State
  isVerifyingInvite: boolean;
  verifiedInvite: VerifyInvitationResponse | null;
  isAcceptingInvite: boolean;
  acceptSuccess: boolean;
  // Team Members
  teamMembers: TeamMember[];
  isLoadingTeamMembers: boolean;
  teamMembersError: string | null;
  // Sent Invitations (admin only)
  invitations: PaginatedInvitations | null;
  isLoadingInvitations: boolean;
  invitationsError: string | null;
  // Change Password
  isChangingPassword: boolean;
  changePasswordSuccess: boolean;
  changePasswordError: string | null;
  // AI Assistant Settings (admin only)
  aiSettings: AISettings | null;
  isLoadingAISettings: boolean;
  aiSettingsLoadError: string | null;
  isSavingAISettings: boolean;
  aiSettingsSaveSuccess: boolean;
  aiSettingsSaveError: string | null;
}

export type HandoverRole = 'admin' | 'manager' | 'service';

export interface AISettings {
  bot_name: string;
  system_instructions: string;
  allowed_roles_for_handover: HandoverRole[];
  is_active: boolean;
}

export interface SaveAISettingsPayload {
  bot_name: string;
  system_instructions: string;
  allowed_roles_for_handover: HandoverRole[];
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  org_slug: string;
}