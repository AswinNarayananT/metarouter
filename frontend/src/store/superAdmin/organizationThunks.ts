import { createAsyncThunk } from '@reduxjs/toolkit';
import { superAdminApi } from '@/api/superAdminApi';
import { getApiErrorMessage } from '@/api/errors';
import type { FetchOrganizationsParams } from '@/types/organizationTypes';

export const fetchDashboardStats = createAsyncThunk(
  'organizations/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.get('/api/v1/superadmin/organizations/stats');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load dashboard stats'));
    }
  },
);

export const fetchOrganizations = createAsyncThunk(
  'organizations/fetchAll',
  async (params: FetchOrganizationsParams | undefined, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.get('/api/v1/superadmin/organizations', {
        params: {
          page: params?.page ?? 1,
          page_size: params?.page_size ?? 10,
          search: params?.search?.trim() || undefined,
          status: params?.status && params.status !== 'all' ? params.status : undefined,
        },
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load organizations'));
    }
  },
);

export const fetchOrganization = createAsyncThunk(
  'organizations/fetchOne',
  async (id: number, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.get(`/api/v1/superadmin/organizations/${id}`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load organization'));
    }
  },
);

export const updateOrganizationStatus = createAsyncThunk(
  'organizations/updateStatus',
  async ({ id, status }: { id: number; status: string }, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.patch(`/api/v1/superadmin/organizations/${id}/status`, { subscription_status: status });
      return response.data; 
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update organization status'));
    }
  }
);

export const createOrganizationInvite = createAsyncThunk(
  'organizations/createInvite',
  async (payload: { email: string; organization_name?: string; expires_in_days?: number }, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.post('/api/v1/superadmin/organizations/invitations', payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to create organization invitation'));
    }
  }
);

export const fetchOrganizationInvites = createAsyncThunk(
  'organizations/fetchInvites',
  async (_, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.get('/api/v1/superadmin/organizations/invitations');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to fetch invitations'));
    }
  }
);

export const revokeOrganizationInvite = createAsyncThunk(
  'organizations/revokeInvite',
  async (inviteId: number, { rejectWithValue }) => {
    try {
      await superAdminApi.delete(`/api/v1/superadmin/organizations/invitations/${inviteId}`);
      return inviteId;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to revoke invitation'));
    }
  }
);

export const deleteOrganization = createAsyncThunk(
  'organizations/delete',
  async (id: number, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.delete(`/api/v1/superadmin/organizations/${id}`);
      return { id, ...response.data };
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to delete organization'));
    }
  }
);