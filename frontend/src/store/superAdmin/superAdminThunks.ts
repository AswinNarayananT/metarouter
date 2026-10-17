import { createAsyncThunk } from '@reduxjs/toolkit';
import { superAdminApi } from '@/api/superAdminApi';
import { getApiErrorMessage } from '@/api/errors';

// Async Thunk for Super Admin Login
export const loginSuperAdmin = createAsyncThunk(
  'superAdmin/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.post('/api/v1/superadmin/login', credentials);
      const data = response.data;

      // Persist in localStorage
      localStorage.setItem('super_admin_token', data.access_token);
      localStorage.setItem('super_admin_user', JSON.stringify(data.user));

      return data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Invalid login credentials'));
    }
  }
);

// Async Thunk to update the super admin's profile (name)
export const updateSuperAdminProfile = createAsyncThunk(
  'superAdmin/updateProfile',
  async (payload: { name: string }, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.patch('/api/v1/superadmin/profile', payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update profile'));
    }
  }
);

// Async Thunk to change the super admin's password
export const changeSuperAdminPassword = createAsyncThunk(
  'superAdmin/changePassword',
  async (payload: { current_password: string; new_password: string }, { rejectWithValue }) => {
    try {
      const response = await superAdminApi.post('/api/v1/superadmin/change-password', payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update password'));
    }
  }
);
