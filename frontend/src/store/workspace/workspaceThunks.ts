import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { LoginCredentials, VerifyInvitationResponse,
  AcceptInvitationPayload, TeamMember, PaginatedInvitations,
  FetchInvitationsParams, ChangePasswordPayload, AISettings,
  SaveAISettingsPayload, InvitePayloadItem, InvitationItemResult,
  WorkspaceUser, CurrentOrganization } from '@/types/workspaceTypes';

// Async Thunk for Workspace Login
export const loginWorkspaceUser = createAsyncThunk(
  'workspace/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/auth/login', credentials);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Invalid login credentials'));
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

// Async Thunk to rename the current organization (admin only)
export const updateOrganization = createAsyncThunk(
  'workspace/updateOrganization',
  async (payload: { name: string }, { rejectWithValue }) => {
    try {
      const response = await api.patch<CurrentOrganization>('/api/v1/organizations/current', payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update organization'));
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
      const response = await api.post<{ invitations: InvitationItemResult[] }>(
        '/api/v1/invitations/generate',
        { members }
      );
      return response.data.invitations; // Returns array of generated invite links
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
