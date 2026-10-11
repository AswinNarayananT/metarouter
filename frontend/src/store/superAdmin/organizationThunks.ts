import { createAsyncThunk } from '@reduxjs/toolkit';
import { superAdminApi } from '@/api/superAdminApi';
import type { OrganizationCreatePayload } from '@/types/organization';

export const fetchDashboardStats = createAsyncThunk(
  'organizations/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.get('/api/v1/superadmin/organizations/stats');
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load dashboard stats');
    }
  },
);

export const fetchOrganizations = createAsyncThunk(
  'organizations/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.get('/api/v1/superadmin/organizations');
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load organizations');
    }
  },
);

export const fetchOrganization = createAsyncThunk(
  'organizations/fetchOne',
  async (id: number, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.get(`/api/v1/superadmin/organizations/${id}`);
      return response.data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load organization');
    }
  },
);

export const createOrganization = createAsyncThunk(
  'organizations/create',
  async (payload: OrganizationCreatePayload, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.post('/api/v1/superadmin/organizations', payload);
      const data = response.data;
      if (data?.id && data?.admin_password) {
        sessionStorage.setItem(`org_admin_password_${data.id}`, data.admin_password);
      }
      return data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to create organization');
    }
  },
);

export const updateOrganizationStatus = createAsyncThunk(
  'organizations/updateStatus',
  async ({ id, status }: { id: number; status: string }, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.patch(`/api/v1/superadmin/organizations/${id}/status`, { subscription_status: status });
      return response.data; 
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to update organization status');
    }
  }
);