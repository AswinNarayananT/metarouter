export interface WorkspaceUser {
  id: number;
  name: string;
  email: string;
  role: string;
  organization_id: number;
  organization_name: string;
  features?: Record<string, boolean>;
  impersonation?: ImpersonationInfo | null;
  can_handle_chats?: boolean; // Role may pick up / take over unassigned chats (AI settings); sent by /auth/me
}

// Set only when a super admin is viewing the workspace as this user (read-only support session)
export interface ImpersonationInfo {
  admin_email: string;
  expires_at: number; // Unix seconds
  read_only: boolean;
}

export interface CurrentOrganization {
  id: number;
  name: string;
  slug: string;
  created_at: string | null;
  features?: Record<string, boolean>;
}

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  removed_at?: string | null; // Set for removed members (Team Members' "Former" tab)
  removal_type?: 'removed' | 'left' | null; // Removed by an admin, or left themselves
}

export type MemberListStatus = 'current' | 'removed';

// Team Members page: one tab, searched and paginated by the server
export interface PaginatedTeamMembers {
  items: TeamMember[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  current_count: number; // Tab counts, ignoring the search
  removed_count: number;
}

export interface FetchMembersPageParams {
  status: MemberListStatus;
  search?: string;
  page?: number;
  page_size?: number;
}

// Shown in the remove dialog: what needs a new owner
export interface MemberOpenWork {
  open_chats: number;
  open_tickets: number;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface InvitationListItem {
  id: number;
  name: string;
  email: string;
  role: string;
  status: InvitationStatus;
  invite_link?: string | null; // Pending invites only, for "Copy link"
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
  search?: string; // Name or email
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
  resent?: boolean; // Replaced a pending invite: the old link no longer works
}

// Emails the server didn't invite, and why (already a member, account in another workspace…)
export interface InvitationSkipped {
  email: string;
  reason: string;
}

export interface BulkInvitationResult {
  invitations: InvitationItemResult[];
  skipped: InvitationSkipped[];
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
  features: Record<string, boolean>;
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

// Why sign-in failed; `field` is set when one input is wrong (shown under that input)
export interface LoginErrorPayload {
  message: string;
  field: 'email' | 'password' | null;
}