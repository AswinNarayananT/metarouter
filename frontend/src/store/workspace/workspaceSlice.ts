import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { WorkspaceState } from '@/types/workspaceTypes';
import { loginWorkspaceUser } from './workspaceThunks';

// Initial state loaded from localStorage if available
const initialState: WorkspaceState = {
  user: JSON.parse(localStorage.getItem('workspace_user') || 'null'),
  token: localStorage.getItem('workspace_token'),
  isLoading: false,
  error: null,
};

export const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    logoutWorkspace: (state) => {
      state.user = null;
      state.token = null;
      state.error = null;
      localStorage.removeItem('workspace_token');
      localStorage.removeItem('workspace_user');
    },
    clearWorkspaceError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginWorkspaceUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWorkspaceUser.fulfilled, (state, action: PayloadAction<any>) => {
        state.isLoading = false;
        state.token = action.payload.access_token;
        state.user = action.payload.user;
      })
      .addCase(loginWorkspaceUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logoutWorkspace, clearWorkspaceError } = workspaceSlice.actions;
export default workspaceSlice.reducer;