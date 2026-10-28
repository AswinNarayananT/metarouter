import { createSlice } from '@reduxjs/toolkit';
import type { DashboardStats, OrganizationDetail, OrganizationListItem, OrganizationInvitation } from '@/types/organizationTypes';
import {
  fetchDashboardStats,
  fetchOrganization,
  fetchOrganizations,
  updateOrganizationStatus,
  createOrganizationInvite,
  fetchOrganizationInvites,
  revokeOrganizationInvite,
  deleteOrganization,
} from './organizationThunks';

interface OrganizationState {
  list: OrganizationListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  current: OrganizationDetail | null;
  stats: DashboardStats | null;
  invitations: OrganizationInvitation[];
  isInviting: boolean;
  isDeleting: boolean;
  lastInvitation: OrganizationInvitation | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

const initialState: OrganizationState = {
  list: [],
  total: 0,
  page: 1,
  page_size: 10,
  total_pages: 1,
  current: null,
  stats: null,
  invitations: [],
  isInviting: false,
  isDeleting: false,
  lastInvitation: null,
  isLoading: false,
  isSaving: false,
  error: null,
};


const organizationSlice = createSlice({
  name: 'organizations',
  initialState,
  reducers: {
    clearOrganizationError: (state) => {
      state.error = null;
    },
    clearCurrentOrganization: (state) => {
      state.current = null;
    },
    clearLastInvitation: (state) => {
      state.lastInvitation = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardStats.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.isLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchOrganizations.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOrganizations.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload && typeof action.payload === 'object' && 'items' in action.payload) {
          state.list = action.payload.items;
          state.total = action.payload.total;
          state.page = action.payload.page;
          state.page_size = action.payload.page_size;
          state.total_pages = action.payload.total_pages;
        } else if (Array.isArray(action.payload)) {
          state.list = action.payload;
          state.total = action.payload.length;
          state.page = 1;
          state.page_size = action.payload.length || 10;
          state.total_pages = 1;
        }
      })
      .addCase(fetchOrganizations.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchOrganization.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOrganization.fulfilled, (state, action) => {
        state.isLoading = false;
        state.current = action.payload;
      })
      .addCase(fetchOrganization.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Update Organization Status Handling
      .addCase(updateOrganizationStatus.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(updateOrganizationStatus.fulfilled, (state, action) => {
        state.isSaving = false;
        const updatedStatus = action.payload.subscription_status;

        // Update current organization detail if currently loaded
        if (state.current && state.current.id === action.payload.id) {
          state.current.subscription_status = updatedStatus;
        }

        // Also update the list array
        const index = state.list.findIndex((org) => org.id === action.payload.id);
        if (index !== -1) {
          state.list[index].subscription_status = updatedStatus;
        }
      })
      // Failed actions show as a toast (store/errorToastMiddleware); `error` stays for page loads
      .addCase(updateOrganizationStatus.rejected, (state) => {
        state.isSaving = false;
      })
      // Organization Invitations
      .addCase(createOrganizationInvite.pending, (state) => {
        state.isInviting = true;
        state.error = null;
      })
      .addCase(createOrganizationInvite.fulfilled, (state, action) => {
        state.isInviting = false;
        state.lastInvitation = action.payload;
        state.invitations = [action.payload, ...state.invitations.filter((i) => i.id !== action.payload.id)];
      })
      .addCase(createOrganizationInvite.rejected, (state) => {
        state.isInviting = false;
      })
      .addCase(fetchOrganizationInvites.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOrganizationInvites.fulfilled, (state, action) => {
        state.isLoading = false;
        state.invitations = action.payload;
      })
      .addCase(fetchOrganizationInvites.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(revokeOrganizationInvite.fulfilled, (state, action) => {
        state.invitations = state.invitations.filter((i) => i.id !== action.payload);
        if (state.lastInvitation?.id === action.payload) {
          state.lastInvitation = null;
        }
      })
      // Delete Organization
      .addCase(deleteOrganization.pending, (state) => {
        state.isDeleting = true;
        state.error = null;
      })
      .addCase(deleteOrganization.fulfilled, (state, action) => {
        state.isDeleting = false;
        state.list = state.list.filter((org) => org.id !== action.payload.id);
        state.total = Math.max(0, state.total - 1);
        if (state.current && state.current.id === action.payload.id) {
          state.current = null;
        }
      })
      .addCase(deleteOrganization.rejected, (state) => {
        state.isDeleting = false;
      });
  },
});

export const { clearOrganizationError, clearCurrentOrganization, clearLastInvitation } = organizationSlice.actions;

export default organizationSlice.reducer;