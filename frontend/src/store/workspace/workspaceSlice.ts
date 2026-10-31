import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { WorkspaceState, WorkspaceUser, VerifyInvitationResponse, LoginErrorPayload } from '@/types/workspaceTypes';
import { 
  loginWorkspaceUser, 
  fetchCurrentUser,
  fetchOrganization,
  updateCurrentUser,
  updateOrganization,
  setAiAutoReply,
  fetchTeamMembers,
  updateMemberRole,
  removeMember,
  restoreMember,
  fetchInvitations,
  changePassword,
  fetchAISettings,
  saveAISettings,
  generateWorkspaceInvitations, 
  verifyInvitationToken, 
  acceptWorkspaceInvitation 
} from './workspaceThunks';

// A support session (super admin viewing as a user) keeps its token in sessionStorage: it stays in that one tab,
// ends when the tab closes, and never replaces the browser's own workspace login in localStorage
export const IMPERSONATION_TOKEN_KEY = 'impersonation_token';

export function isImpersonationTab(): boolean {
  return sessionStorage.getItem(IMPERSONATION_TOKEN_KEY) !== null;
}

function saveToken(token: string) {
  if (isImpersonationTab()) sessionStorage.setItem(IMPERSONATION_TOKEN_KEY, token);
  else localStorage.setItem('workspace_token', token);
}

const tokenFromStorage = sessionStorage.getItem(IMPERSONATION_TOKEN_KEY) || localStorage.getItem('workspace_token');
const initialState: WorkspaceState = {
  user: null,
  token: tokenFromStorage || null,
  organization: null,
  features: {},
  isLoading: false,
  error: null,
  settingsSaveSuccess: false,
  settingsSaveError: null,
  isInviting: false,
  inviteSuccess: false,
  lastInvitations: [],
  isVerifyingInvite: false,
  verifiedInvite: null,
  isAcceptingInvite: false,
  acceptSuccess: false,
  teamMembers: [],
  isLoadingTeamMembers: false,
  teamMembersError: null,
  invitations: null,
  isLoadingInvitations: false,
  invitationsError: null,
  isChangingPassword: false,
  changePasswordSuccess: false,
  changePasswordError: null,
  aiSettings: null,
  isLoadingAISettings: false,
  aiSettingsLoadError: null,
  isSavingAISettings: false,
  aiSettingsSaveSuccess: false,
  aiSettingsSaveError: null,
};

export const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: WorkspaceUser | null; access_token: string }>) => {
      state.token = action.payload.access_token;
      state.user = action.payload.user;
      state.features = action.payload.user?.features || {};
      saveToken(action.payload.access_token);
    },
    startImpersonation: (state, action: PayloadAction<{ user: WorkspaceUser; access_token: string }>) => {
      state.token = action.payload.access_token;
      state.user = action.payload.user;
      state.features = action.payload.user.features || {};
      state.organization = null;
      sessionStorage.setItem(IMPERSONATION_TOKEN_KEY, action.payload.access_token);
    },
    logoutWorkspace: (state) => {
      state.user = null;
      state.token = null;
      state.features = {};
      state.error = null;
      state.organization = null;
      state.settingsSaveSuccess = false;
      state.settingsSaveError = null;
      state.isInviting = false;
      state.inviteSuccess = false;
      state.lastInvitations = [];
      state.isVerifyingInvite = false;
      state.verifiedInvite = null;
      state.isAcceptingInvite = false;
      state.acceptSuccess = false;
      state.teamMembers = [];
      state.isLoadingTeamMembers = false;
      state.teamMembersError = null;
      state.invitations = null;
      state.isLoadingInvitations = false;
      state.invitationsError = null;
      state.isChangingPassword = false;
      state.changePasswordSuccess = false;
      state.changePasswordError = null;
      state.aiSettings = null;
      state.isLoadingAISettings = false;
      state.aiSettingsLoadError = null;
      state.isSavingAISettings = false;
      state.aiSettingsSaveSuccess = false;
      state.aiSettingsSaveError = null;
      // Ending a support session leaves the browser's own workspace login alone
      if (isImpersonationTab()) sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
      else localStorage.removeItem('workspace_token');
    },
    resetSettingsSaveState: (state) => {
      state.settingsSaveSuccess = false;
      state.settingsSaveError = null;
    },
    resetAISettingsSaveState: (state) => {
      state.aiSettingsSaveSuccess = false;
      state.aiSettingsSaveError = null;
    },
    resetChangePasswordState: (state) => {
      state.changePasswordSuccess = false;
      state.changePasswordError = null;
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
        state.features = action.payload.user?.features || {};
        localStorage.setItem('workspace_token', action.payload.access_token);
      })
      .addCase(loginWorkspaceUser.rejected, (state, action) => {
        state.isLoading = false;
        // A wrong email / password is shown under that input (LoginForm); anything else in the banner
        const payload = action.payload as LoginErrorPayload | undefined;
        state.error = payload?.field ? null : payload?.message ?? 'Sign-in failed. Please try again.';
      })
      // Fetch Current User
      .addCase(fetchCurrentUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.features = action.payload.user?.features || {};
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
        if (action.payload.features) {
          state.features = action.payload.features;
          if (state.user) {
            state.user.features = action.payload.features;
          }
        }
      })
      .addCase(fetchOrganization.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Update Current User Profile
      .addCase(updateCurrentUser.pending, (state) => {
        state.settingsSaveSuccess = false;
        state.settingsSaveError = null;
      })
      .addCase(updateCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.settingsSaveSuccess = true;
      })
      .addCase(updateCurrentUser.rejected, (state, action) => {
        state.settingsSaveError = action.payload as string;
      })
      // Update Organization
      .addCase(updateOrganization.pending, (state) => {
        state.settingsSaveSuccess = false;
        state.settingsSaveError = null;
      })
      .addCase(updateOrganization.fulfilled, (state, action) => {
        // Merged: the save answer has no features / supported currencies
        state.organization = { ...state.organization, ...action.payload };
        if (state.user) state.user.organization_name = action.payload.name;
        state.settingsSaveSuccess = true;
      })
      .addCase(updateOrganization.rejected, (state, action) => {
        state.settingsSaveError = action.payload as string;
      })
      .addCase(setAiAutoReply.fulfilled, (state, action) => {
        if (state.organization) state.organization.ai_auto_reply = action.payload;
      })
      // Fetch Team Members
      .addCase(fetchTeamMembers.pending, (state) => {
        state.isLoadingTeamMembers = true;
        state.teamMembersError = null;
      })
      .addCase(fetchTeamMembers.fulfilled, (state, action) => {
        state.isLoadingTeamMembers = false;
        state.teamMembers = action.payload;
      })
      .addCase(fetchTeamMembers.rejected, (state, action) => {
        state.isLoadingTeamMembers = false;
        state.teamMembersError = action.payload as string;
      })
      // Fetch Sent Invitations
      .addCase(fetchInvitations.pending, (state) => {
        state.isLoadingInvitations = true;
        state.invitationsError = null;
      })
      .addCase(fetchInvitations.fulfilled, (state, action) => {
        state.isLoadingInvitations = false;
        state.invitations = action.payload;
      })
      .addCase(fetchInvitations.rejected, (state, action) => {
        state.isLoadingInvitations = false;
        state.invitationsError = action.payload as string;
      })
      // Change Password
      .addCase(changePassword.pending, (state) => {
        state.isChangingPassword = true;
        state.changePasswordSuccess = false;
        state.changePasswordError = null;
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.isChangingPassword = false;
        state.changePasswordSuccess = true;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.isChangingPassword = false;
        state.changePasswordError = action.payload as string;
      })
      // Fetch AI Settings
      .addCase(fetchAISettings.pending, (state) => {
        state.isLoadingAISettings = true;
        state.aiSettingsLoadError = null;
      })
      .addCase(fetchAISettings.fulfilled, (state, action) => {
        state.isLoadingAISettings = false;
        state.aiSettings = action.payload;
      })
      .addCase(fetchAISettings.rejected, (state, action) => {
        state.isLoadingAISettings = false;
        state.aiSettingsLoadError = action.payload as string;
      })
      // Save AI Settings
      .addCase(saveAISettings.pending, (state) => {
        state.isSavingAISettings = true;
        state.aiSettingsSaveSuccess = false;
        state.aiSettingsSaveError = null;
      })
      .addCase(saveAISettings.fulfilled, (state, action) => {
        state.isSavingAISettings = false;
        state.aiSettingsSaveSuccess = true;
        state.aiSettings = action.payload;
      })
      .addCase(saveAISettings.rejected, (state, action) => {
        state.isSavingAISettings = false;
        state.aiSettingsSaveError = action.payload as string;
      })
      // Bulk Invitations Generation
      .addCase(generateWorkspaceInvitations.pending, (state) => {
        state.isInviting = true;
        state.error = null;
        state.inviteSuccess = false;
      })
      .addCase(generateWorkspaceInvitations.fulfilled, (state, action) => {
        state.isInviting = false;
        // Only a success when someone was actually invited (the page shows why the others weren't)
        state.inviteSuccess = action.payload.invitations.length > 0;
        state.lastInvitations = action.payload.invitations;
      })
      // Role changed on Team Members
      .addCase(updateMemberRole.fulfilled, (state, action) => {
        state.teamMembers = state.teamMembers.map((m) => (m.id === action.payload.id ? action.payload : m));
      })
      // Removed members leave the list (and every assign menu); restored ones come back
      .addCase(removeMember.fulfilled, (state, action) => {
        state.teamMembers = state.teamMembers.filter((m) => m.id !== action.payload.id);
      })
      .addCase(restoreMember.fulfilled, (state, action) => {
        state.teamMembers = [...state.teamMembers.filter((m) => m.id !== action.payload.id), action.payload];
      })
      // Shown as a toast (store/errorToastMiddleware)
      .addCase(generateWorkspaceInvitations.rejected, (state) => {
        state.isInviting = false;
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
      // Shown as a toast; `error` stays for an invalid / expired link (verifyInvitationToken)
      .addCase(acceptWorkspaceInvitation.rejected, (state) => {
        state.isAcceptingInvite = false;
        state.acceptSuccess = false;
      });
  },
});

export const {
  setCredentials,
  startImpersonation,
  logoutWorkspace,
  clearWorkspaceError,
  resetInviteState,
  resetSettingsSaveState,
  resetChangePasswordState,
  resetAISettingsSaveState,
} = workspaceSlice.actions;
export default workspaceSlice.reducer;