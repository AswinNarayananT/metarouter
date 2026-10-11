export interface WorkspaceUser {
  id: number;
  name: string;
  email: string;
  role: string;
  organization_id:number;
  organization_name: string;
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
  organization: any | null;
  isLoading: boolean;
  error: string | null;
  isInviting: boolean;
  inviteSuccess: boolean;
  lastInvitations: InvitationItemResult[];
  // Invitation Verification and Onboarding State
  isVerifyingInvite: boolean;
  verifiedInvite: VerifyInvitationResponse | null;
  isAcceptingInvite: boolean;
  acceptSuccess: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  org_slug: string;
}