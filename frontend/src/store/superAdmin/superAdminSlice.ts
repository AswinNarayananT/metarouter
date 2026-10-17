import { createSlice } from '@reduxjs/toolkit';
import { loginSuperAdmin, updateSuperAdminProfile, changeSuperAdminPassword } from './superAdminThunks';

export interface SuperAdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at?: string | null;
}

interface SuperAdminState {
  token: string | null;
  user: SuperAdminUser | null;
  isLoading: boolean;
  error: string | null;
  // Profile update
  isSavingProfile: boolean;
  profileSuccess: boolean;
  profileError: string | null;
  // Password change
  isChangingPassword: boolean;
  passwordSuccess: boolean;
  passwordError: string | null;
}

const initialState: SuperAdminState = {
  token: localStorage.getItem('super_admin_token'),
  user: JSON.parse(localStorage.getItem('super_admin_user') || 'null'),
  isLoading: false,
  error: null,
  isSavingProfile: false,
  profileSuccess: false,
  profileError: null,
  isChangingPassword: false,
  passwordSuccess: false,
  passwordError: null,
};

const superAdminSlice = createSlice({
  name: 'superAdmin',
  initialState,
  reducers: {
    logoutSuperAdmin: (state) => {
      state.token = null;
      state.user = null;
      state.error = null;
      state.profileSuccess = false;
      state.profileError = null;
      state.passwordSuccess = false;
      state.passwordError = null;
      localStorage.removeItem('super_admin_token');
      localStorage.removeItem('super_admin_user');
    },
    clearSuperAdminError: (state) => {
      state.error = null;
    },
    resetSuperAdminSettingsState: (state) => {
      state.profileSuccess = false;
      state.profileError = null;
      state.passwordSuccess = false;
      state.passwordError = null;
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
        localStorage.setItem('super_admin_token', action.payload.access_token);
        localStorage.setItem('super_admin_user', JSON.stringify(action.payload.user));
      })
      .addCase(loginSuperAdmin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Update profile
      .addCase(updateSuperAdminProfile.pending, (state) => {
        state.isSavingProfile = true;
        state.profileSuccess = false;
        state.profileError = null;
      })
      .addCase(updateSuperAdminProfile.fulfilled, (state, action) => {
        state.isSavingProfile = false;
        state.profileSuccess = true;
        state.user = action.payload;
        localStorage.setItem('super_admin_user', JSON.stringify(action.payload));
      })
      .addCase(updateSuperAdminProfile.rejected, (state, action) => {
        state.isSavingProfile = false;
        state.profileError = action.payload as string;
      })
      // Change password
      .addCase(changeSuperAdminPassword.pending, (state) => {
        state.isChangingPassword = true;
        state.passwordSuccess = false;
        state.passwordError = null;
      })
      .addCase(changeSuperAdminPassword.fulfilled, (state) => {
        state.isChangingPassword = false;
        state.passwordSuccess = true;
      })
      .addCase(changeSuperAdminPassword.rejected, (state, action) => {
        state.isChangingPassword = false;
        state.passwordError = action.payload as string;
      });
  },
});

export const { logoutSuperAdmin, clearSuperAdminError, resetSuperAdminSettingsState } = superAdminSlice.actions;
export default superAdminSlice.reducer;
