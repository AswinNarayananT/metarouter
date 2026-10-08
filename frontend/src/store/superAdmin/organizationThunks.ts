import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import type { OrganizationCreatePayload } from '@/types/organization';

export const fetchDashboardStats = createAsyncThunk(
  'organizations/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/admin/organizations/stats');
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
      const response = await api.get('/api/v1/admin/organizations');
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
      const response = await api.get(`/api/v1/admin/organizations/${id}`);
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
      const response = await api.post('/api/v1/admin/organizations', payload);
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
