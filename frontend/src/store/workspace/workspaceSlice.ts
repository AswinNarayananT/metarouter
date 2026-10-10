import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { WorkspaceState, VerifyInvitationResponse } from '@/types/workspaceTypes';
import { 
  loginWorkspaceUser, 
  fetchCurrentUser,
  fetchOrganization,
  generateWorkspaceInvitations, 
  verifyInvitationToken, 
  acceptWorkspaceInvitation 
} from './workspaceThunks';

const tokenFromStorage = localStorage.getItem('workspace_token');
const initialState: WorkspaceState = {
  user: null,
  token: tokenFromStorage || null,
  organization: null,
  isLoading: false,
  error: null,
  isInviting: false,
  inviteSuccess: false,
  lastInvitations: [],
  isVerifyingInvite: false,
  verifiedInvite: null,
  isAcceptingInvite: false,
  acceptSuccess: false,
};

export const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: any; access_token: string }>) => {
      state.token = action.payload.access_token;
      state.user = action.payload.user;
      localStorage.setItem('workspace_token', action.payload.access_token);
    },
    logoutWorkspace: (state) => {
      state.user = null;
      state.token = null;
      state.error = null;
      state.isInviting = false;
      state.inviteSuccess = false;
      state.lastInvitations = [];
      state.isVerifyingInvite = false;
      state.verifiedInvite = null;
      state.isAcceptingInvite = false;
      state.acceptSuccess = false;
      localStorage.removeItem('workspace_token');
    },
    clearWorkspaceError: (state) => {
      state.error = null;
    },
    resetInviteState: (state) => {
      state.isInviting = false;
      state.inviteSuccess = false;
      state.lastInvitations = [];
      state.isVerifyingInvite = false;
      state.verifiedInvite = null;
      state.isAcceptingInvite = false;
      state.acceptSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginWorkspaceUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWorkspaceUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.token = action.payload.access_token;
        state.user = action.payload.user;
        localStorage.setItem('workspace_token', action.payload.access_token);
      })
      .addCase(loginWorkspaceUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch Current User
      .addCase(fetchCurrentUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch Organization
      .addCase(fetchOrganization.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOrganization.fulfilled, (state, action) => {
        state.isLoading = false;
        state.organization = action.payload;
      })
      .addCase(fetchOrganization.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Bulk Invitations Generation
      .addCase(generateWorkspaceInvitations.pending, (state) => {
        state.isInviting = true;
        state.error = null;
        state.inviteSuccess = false;
      })
      .addCase(generateWorkspaceInvitations.fulfilled, (state, action) => {
        state.isInviting = false;
        state.inviteSuccess = true;
        state.lastInvitations = action.payload;
      })
      .addCase(generateWorkspaceInvitations.rejected, (state, action) => {
        state.isInviting = false;
        state.error = action.payload as string;
        state.inviteSuccess = false;
      })
      // Verify Invitation Token
      .addCase(verifyInvitationToken.pending, (state) => {
        state.isVerifyingInvite = true;
        state.error = null;
        state.verifiedInvite = null;
      })
      .addCase(verifyInvitationToken.fulfilled, (state, action: PayloadAction<VerifyInvitationResponse>) => {
        state.isVerifyingInvite = false;
        state.verifiedInvite = action.payload;
      })
      .addCase(verifyInvitationToken.rejected, (state, action) => {
        state.isVerifyingInvite = false;
        state.error = action.payload as string;
      })
      // Accept Invitation & Register Password
      .addCase(acceptWorkspaceInvitation.pending, (state) => {
        state.isAcceptingInvite = true;
        state.error = null;
        state.acceptSuccess = false;
      })
      .addCase(acceptWorkspaceInvitation.fulfilled, (state) => {
        state.isAcceptingInvite = false;
        state.acceptSuccess = true;
      })
      .addCase(acceptWorkspaceInvitation.rejected, (state, action) => {
        state.isAcceptingInvite = false;
        state.error = action.payload as string;
        state.acceptSuccess = false;
      });
  },
});

export const { setCredentials, logoutWorkspace, clearWorkspaceError, resetInviteState } = workspaceSlice.actions;
export default workspaceSlice.reducer;