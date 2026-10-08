import { createSlice } from '@reduxjs/toolkit';
import { loginSuperAdmin } from './superAdminThunks';

interface SuperAdminState {
  token: string | null;
  user: any | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: SuperAdminState = {
  token: localStorage.getItem('super_admin_token'),
  user: JSON.parse(localStorage.getItem('super_admin_user') || 'null'),
  isLoading: false,
  error: null,
};

const superAdminSlice = createSlice({
  name: 'superAdmin',
  initialState,
  reducers: {
    logoutSuperAdmin: (state) => {
      state.token = null;
      state.user = null;
      state.error = null;
      localStorage.removeItem('super_admin_token');
      localStorage.removeItem('super_admin_user');
    },
    clearSuperAdminError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle login lifecycle
      .addCase(loginSuperAdmin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginSuperAdmin.fulfilled, (state, action) => {
        state.isLoading = false;
        state.token = action.payload.access_token;
        state.user = action.payload.user;
      })
      .addCase(loginSuperAdmin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logoutSuperAdmin, clearSuperAdminError } = superAdminSlice.actions;
export default superAdminSlice.reducer;