import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import type { LoginCredentials, VerifyInvitationResponse, 
  AcceptInvitationPayload} from '@/types/workspaceTypes';

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
  async (organizationId: number, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/organizations/${organizationId}`);
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch organization');
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