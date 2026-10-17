import { createSlice } from '@reduxjs/toolkit';
import type { BroadcastState } from '@/types/broadcastTypes';
import {
  createBroadcast,
  fetchBroadcastDetail,
  fetchBroadcasts,
  fetchTemplates,
  fetchWhatsAppNumbers,
  previewBroadcast,
} from './broadcastThunks';

const initialState: BroadcastState = {
  numbers: [],
  isLoadingNumbers: false,
  numbersError: null,

  templates: [],
  isLoadingTemplates: false,
  templatesError: null,

  preview: null,
  isPreviewing: false,
  previewError: null,

  isCreating: false,
  createError: null,

  list: null,
  isLoadingList: false,
  listError: null,

  detail: null,
  isLoadingDetail: false,
  detailError: null,
};

const broadcastSlice = createSlice({
  name: 'broadcast',
  initialState,
  reducers: {
    // Called when entering the new-broadcast page or changing its inputs
    resetBroadcastDraft: (state) => {
      state.preview = null;
      state.previewError = null;
      state.createError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Clear everything when the workspace user logs out
      .addCase('workspace/logoutWorkspace', () => initialState)

      .addCase(fetchWhatsAppNumbers.pending, (state) => {
        state.isLoadingNumbers = true;
        state.numbersError = null;
      })
      .addCase(fetchWhatsAppNumbers.fulfilled, (state, action) => {
        state.isLoadingNumbers = false;
        state.numbers = action.payload;
      })
      .addCase(fetchWhatsAppNumbers.rejected, (state, action) => {
        state.isLoadingNumbers = false;
        state.numbersError = action.payload as string;
      })

      .addCase(fetchTemplates.pending, (state) => {
        state.isLoadingTemplates = true;
        state.templatesError = null;
        state.templates = [];
      })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.isLoadingTemplates = false;
        state.templates = action.payload;
      })
      .addCase(fetchTemplates.rejected, (state, action) => {
        state.isLoadingTemplates = false;
        state.templatesError = action.payload as string;
      })

      .addCase(previewBroadcast.pending, (state) => {
        state.isPreviewing = true;
        state.previewError = null;
        state.preview = null;
      })
      .addCase(previewBroadcast.fulfilled, (state, action) => {
        state.isPreviewing = false;
        state.preview = action.payload;
      })
      .addCase(previewBroadcast.rejected, (state, action) => {
        state.isPreviewing = false;
        state.previewError = action.payload as string;
      })

      .addCase(createBroadcast.pending, (state) => {
        state.isCreating = true;
        state.createError = null;
      })
      .addCase(createBroadcast.fulfilled, (state) => {
        state.isCreating = false;
        state.preview = null;
      })
      .addCase(createBroadcast.rejected, (state, action) => {
        state.isCreating = false;
        state.createError = action.payload as string;
      })

      .addCase(fetchBroadcasts.pending, (state) => {
        state.isLoadingList = true;
        state.listError = null;
      })
      .addCase(fetchBroadcasts.fulfilled, (state, action) => {
        state.isLoadingList = false;
        state.list = action.payload;
      })
      .addCase(fetchBroadcasts.rejected, (state, action) => {
        state.isLoadingList = false;
        state.listError = action.payload as string;
      })

      .addCase(fetchBroadcastDetail.pending, (state) => {
        state.isLoadingDetail = true;
        state.detailError = null;
      })
      .addCase(fetchBroadcastDetail.fulfilled, (state, action) => {
        state.isLoadingDetail = false;
        state.detail = action.payload;
      })
      .addCase(fetchBroadcastDetail.rejected, (state, action) => {
        state.isLoadingDetail = false;
        state.detailError = action.payload as string;
      });
  },
});

export const { resetBroadcastDraft } = broadcastSlice.actions;
export default broadcastSlice.reducer;
