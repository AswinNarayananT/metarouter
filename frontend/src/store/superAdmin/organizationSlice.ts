import { createSlice } from '@reduxjs/toolkit';
import type { DashboardStats, OrganizationDetail, OrganizationListItem } from '@/types/organizationTypes';
import {
  createOrganization,
  fetchDashboardStats,
  fetchOrganization,
  fetchOrganizations,
  updateOrganizationStatus,
} from './organizationThunks';

interface OrganizationState {
  list: OrganizationListItem[];
  current: OrganizationDetail | null;
  stats: DashboardStats | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

const initialState: OrganizationState = {
  list: [],
  current: null,
  stats: null,
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
        state.list = action.payload;
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
      .addCase(createOrganization.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(createOrganization.fulfilled, (state, action) => {
        state.isSaving = false;
        state.current = action.payload;
      })
      .addCase(createOrganization.rejected, (state, action) => {
        state.isSaving = false;
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
      .addCase(updateOrganizationStatus.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearOrganizationError, clearCurrentOrganization } = organizationSlice.actions;
export default organizationSlice.reducer;