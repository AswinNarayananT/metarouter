import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import type { LoginCredentials, VerifyInvitationResponse, 
  AcceptInvitationPayload, TeamMember, PaginatedInvitations,
  FetchInvitationsParams, ChangePasswordPayload } from '@/types/workspaceTypes';

// Async Thunk for Tenant / Workspace Login
export const loginWorkspaceUser = createAsyncThunk(
  'workspace/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/auth/login', credentials);
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Invalid login credentials');
    }
  }
);

// Async Thunk to fetch current user
export const fetchCurrentUser = createAsyncThunk(
  'workspace/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/auth/me');
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch user');
    }
  }
);

// Async Thunk to fetch organization details
export const fetchOrganization = createAsyncThunk(
  'workspace/fetchOrganization',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/organizations/current');
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch organization');
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
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch team members');
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
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch invitations');
    }
  }
);

// Async Thunk to change the current user's password
export const changePassword = createAsyncThunk(
  'workspace/changePassword',
  async (payload: ChangePasswordPayload, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/auth/change-password', payload);
      return response.data; // Returns { message: "Password updated successfully" }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      // FastAPI validation errors (422) return detail as an array
      if (Array.isArray(detail)) {
        return rejectWithValue(detail[0]?.msg?.replace(/^Value error, /, '') || 'Invalid password');
      }
      return rejectWithValue(detail || 'Failed to update password');
    }
  }
);

export const generateWorkspaceInvitations = createAsyncThunk(
  'workspace/generateInvitations',
  async (members: { name: string; email: string; role: string }[], { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/invitations/generate', { members });
      return response.data.invitations; // Returns array of generated invite links
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to generate invitation links');
    }
  }
);

export const verifyInvitationToken = createAsyncThunk(
  'workspace/verifyInvitationToken',
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await api.get<VerifyInvitationResponse>(`/api/v1/invitations/verify/${token}`);
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Invalid or expired invitation token');
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
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to complete registration');
    }
  }
);