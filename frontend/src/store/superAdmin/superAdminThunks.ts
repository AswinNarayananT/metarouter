import { createAsyncThunk } from '@reduxjs/toolkit';
import { superAdminApi } from '@/api/superAdminApi';

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
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Invalid login credentials');
    }
  }
);