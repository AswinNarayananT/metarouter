import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { isAxiosError } from 'axios';
import { getApiErrorMessage } from '@/api/errors';
import type { LoginCredentials, LoginErrorPayload, VerifyInvitationResponse,
  AcceptInvitationPayload, TeamMember, MemberOpenWork, PaginatedInvitations,
  PaginatedTeamMembers, FetchMembersPageParams,
  FetchInvitationsParams, ChangePasswordPayload, AISettings,
  SaveAISettingsPayload, InvitePayloadItem, BulkInvitationResult,
  InvitationListItem, InvitationItemResult,
  WorkspaceUser, CurrentOrganization } from '@/types/workspaceTypes';

// Async Thunk for Workspace Login
export const loginWorkspaceUser = createAsyncThunk(
  'workspace/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/auth/login', credentials);
      return response.data;
    } catch (err) {
      // The server says which input is wrong (email / password) so the form can point at it
      const detail = isAxiosError(err) ? err.response?.data?.detail : undefined;
      const field = detail?.field === 'email' || detail?.field === 'password' ? detail.field : null;
      const payload: LoginErrorPayload = { message: getApiErrorMessage(err, 'Sign-in failed. Please try again.'), field };
      return rejectWithValue(payload);
    }
  }
);

// Revokes the tokens on the server and clears the refresh cookie, then signs out locally (even if the call fails)
export const logoutWorkspaceSession = createAsyncThunk(
  'workspace/logoutSession',
  async (_, { dispatch }) => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Offline or already expired: the local sign-out below still happens
    }
    dispatch({ type: 'workspace/logoutWorkspace' });
  }
);

// Async Thunk to fetch current user
export const fetchCurrentUser = createAsyncThunk(
  'workspace/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/auth/me');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to fetch user'));
    }
  }
);

// Async Thunk to update the current user's profile (name)
export const updateCurrentUser = createAsyncThunk(
  'workspace/updateCurrentUser',
  async (payload: { name: string }, { rejectWithValue }) => {
    try {
      const response = await api.patch<{ user: WorkspaceUser }>('/api/v1/auth/me', payload);
      return response.data.user;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update profile'));
    }
  }
);

// Async Thunk to fetch organization details
export const fetchOrganization = createAsyncThunk(
  'workspace/fetchOrganization',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<CurrentOrganization>('/api/v1/organizations/current');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to fetch organization'));
    }
  }
);

// Async Thunk to rename the current organization or change its currency (admin only); only the fields sent change
export const updateOrganization = createAsyncThunk(
  'workspace/updateOrganization',
  async (payload: { name?: string; currency?: string }, { rejectWithValue }) => {
    try {
      const response = await api.patch<CurrentOrganization>('/api/v1/organizations/current', payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update organization'));
    }
  }
);

// AI auto-reply on / off (admin only); off = every new chat goes straight to the team
export const setAiAutoReply = createAsyncThunk(
  'workspace/setAiAutoReply',
  async (enabled: boolean, { rejectWithValue }) => {
    try {
      const response = await api.patch<{ auto_reply: boolean }>('/api/v1/ai-settings/auto-reply', { enabled });
      return response.data.auto_reply;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't change AI auto-reply"));
    }
  }
);

// Async Thunk to fetch team members of the current organization
export const fetchTeamMembers = createAsyncThunk(
  'workspace/fetchTeamMembers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<TeamMember[]>('/api/v1/organizations/members');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to fetch team members'));
    }
  }
);

// Admin changes a member's role (Team Members page); a failure shows as a toast
export const updateMemberRole = createAsyncThunk(
  'workspace/updateMemberRole',
  async ({ userId, role }: { userId: number; role: TeamMember['role'] }, { rejectWithValue }) => {
    try {
      const response = await api.patch<TeamMember>(`/api/v1/organizations/members/${userId}/role`, { role });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't change the role"));
    }
  }
);

// Team Members page: current or removed members (removed = admin only), searched and paginated by the server
export const fetchMembersPage = createAsyncThunk(
  'workspace/fetchMembersPage',
  async (params: FetchMembersPageParams, { rejectWithValue }) => {
    try {
      const response = await api.get<PaginatedTeamMembers>('/api/v1/organizations/members/page', { params });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't load team members"));
    }
  }
);

// Admin: the member's open chats and tickets, shown before removing them
export const fetchMemberOpenWork = createAsyncThunk(
  'workspace/fetchMemberOpenWork',
  async (userId: number, { rejectWithValue }) => {
    try {
      const response = await api.get<MemberOpenWork>(`/api/v1/organizations/members/${userId}/open-work`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't check their open chats"));
    }
  }
);

// Admin removes a member; their open chats and tickets go to reassignTo (null = the unassigned queue)
export const removeMember = createAsyncThunk(
  'workspace/removeMember',
  async ({ userId, reassignTo }: { userId: number; reassignTo: number | null }, { rejectWithValue }) => {
    try {
      const response = await api.post<TeamMember>(`/api/v1/organizations/members/${userId}/remove`, { reassign_to_user_id: reassignTo });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't remove the member"));
    }
  }
);

// The signed-in member's own open chats and tickets (leave dialog)
export const fetchMyOpenWork = createAsyncThunk(
  'workspace/fetchMyOpenWork',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<MemberOpenWork>('/api/v1/organizations/members/me/open-work');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't check your open chats"));
    }
  }
);

// The member leaves the workspace (password confirms it); their chats go back to the queue and they're signed out
export const leaveWorkspace = createAsyncThunk(
  'workspace/leave',
  async (password: string, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post<{ message: string }>('/api/v1/organizations/members/me/leave', { password });
      dispatch({ type: 'workspace/logoutWorkspace' });
      return response.data.message;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't leave the workspace"));
    }
  }
);

// Admin brings a removed member back (same account, role and history)
export const restoreMember = createAsyncThunk(
  'workspace/restoreMember',
  async (userId: number, { rejectWithValue }) => {
    try {
      const response = await api.post<TeamMember>(`/api/v1/organizations/members/${userId}/restore`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't restore the member"));
    }
  }
);

// Async Thunk to fetch invitations sent by the organization (admin only, paginated)
export const fetchInvitations = createAsyncThunk(
  'workspace/fetchInvitations',
  async (params: FetchInvitationsParams = {}, { rejectWithValue }) => {
    try {
      const response = await api.get<PaginatedInvitations>('/api/v1/invitations', { params });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to fetch invitations'));
    }
  }
);

// Admin cancels a pending invite: its link stops working
export const revokeInvitation = createAsyncThunk(
  'workspace/revokeInvitation',
  async (invitationId: number, { rejectWithValue }) => {
    try {
      const response = await api.post<InvitationListItem>(`/api/v1/invitations/${invitationId}/revoke`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't revoke the invitation"));
    }
  }
);

// Admin emails a fresh 3-day link (pending, expired or revoked invites); the old link stops working
export const resendInvitation = createAsyncThunk(
  'workspace/resendInvitation',
  async (invitationId: number, { rejectWithValue }) => {
    try {
      const response = await api.post<InvitationItemResult>(`/api/v1/invitations/${invitationId}/resend`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't resend the invitation"));
    }
  }
);

// "Forgot password": the server answers the same whether or not the email has an account
export const requestPasswordReset = createAsyncThunk(
  'workspace/requestPasswordReset',
  async (email: string, { rejectWithValue }) => {
    try {
      const response = await api.post<{ message: string }>('/api/v1/auth/forgot-password', { email });
      return response.data.message;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't send the reset link. Please try again."));
    }
  }
);

// The reset page checks its link first, so an old link says so before a new password is typed
export const verifyPasswordResetToken = createAsyncThunk(
  'workspace/verifyPasswordResetToken',
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await api.post<{ email: string }>('/api/v1/auth/reset-password/verify', { token });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'This reset link has expired or was already used. Request a new one.'));
    }
  }
);

export const resetPassword = createAsyncThunk(
  'workspace/resetPassword',
  async (payload: { token: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await api.post<{ message: string }>('/api/v1/auth/reset-password', payload);
      return response.data.message;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Couldn't reset the password. Please try again."));
    }
  }
);

// Async Thunk to change the current user's password
export const changePassword = createAsyncThunk(
  'workspace/changePassword',
  async (payload: ChangePasswordPayload, { rejectWithValue, dispatch, getState }) => {
    try {
      const response = await api.post<{ message: string; access_token: string }>('/api/v1/auth/change-password', payload);

      // Older sessions are signed out on the server; keep this one with the new token
      const { workspace } = getState() as { workspace: { user: unknown } };
      dispatch({ type: 'workspace/setCredentials', payload: { access_token: response.data.access_token, user: workspace.user } });
      localStorage.setItem('workspace_token', response.data.access_token);

      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update password'));
    }
  }
);

// Async Thunk to fetch the organization's AI assistant settings (admin only)
export const fetchAISettings = createAsyncThunk(
  'workspace/fetchAISettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<AISettings>('/api/v1/ai-settings/');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load AI settings'));
    }
  }
);

// Async Thunk to save AI assistant settings (knowledge base PDFs have their own upload)
export const saveAISettings = createAsyncThunk(
  'workspace/saveAISettings',
  async (payload: SaveAISettingsPayload, { rejectWithValue }) => {
    const formData = new FormData();
    formData.append('bot_name', payload.bot_name);
    formData.append('system_instructions', payload.system_instructions);
    formData.append('allowed_roles_for_handover', payload.allowed_roles_for_handover.join(','));
    formData.append('greeting_message', payload.greeting_message);

    try {
      // Override the instance's JSON default so axios sends multipart with a boundary
      const response = await api.post<{ message: string; settings: AISettings }>(
        '/api/v1/ai-settings/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data.settings;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to save AI settings'));
    }
  }
);

export const generateWorkspaceInvitations = createAsyncThunk(
  'workspace/generateInvitations',
  async (members: InvitePayloadItem[], { rejectWithValue }) => {
    try {
      const response = await api.post<BulkInvitationResult>(
        '/api/v1/invitations/generate',
        { members }
      );
      // The invite links, plus the emails that weren't invited and why
      const result: BulkInvitationResult = { invitations: response.data.invitations, skipped: response.data.skipped ?? [] };
      return result;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to generate invitation links'));
    }
  }
);

export const verifyInvitationToken = createAsyncThunk(
  'workspace/verifyInvitationToken',
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await api.get<VerifyInvitationResponse>(`/api/v1/invitations/verify/${token}`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Invalid or expired invitation token'));
    }
  }
);

// Thunk to accept invitation and create member account
export const acceptWorkspaceInvitation = createAsyncThunk(
  'workspace/acceptWorkspaceInvitation',
  async (payload: AcceptInvitationPayload, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/invitations/accept', payload);
      return response.data; // Returns { message: "Account created successfully..." }
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to complete registration'));
    }
  }
);
