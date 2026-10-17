import { createSlice } from '@reduxjs/toolkit';
import type { KnowledgeState } from '@/types/knowledgeTypes';
import {
  deleteKnowledgeDocument,
  fetchKnowledgeDocuments,
  retryKnowledgeDocument,
  uploadKnowledgeDocument,
} from './knowledgeThunks';

const initialState: KnowledgeState = {
  documents: [],
  maxDocuments: null,
  isLoading: false,
  loadError: null,

  isUploading: false,
  uploadError: null,

  busyIds: [],
  actionError: null,
};

const knowledgeSlice = createSlice({
  name: 'knowledge',
  initialState,
  reducers: {
    clearKnowledgeErrors: (state) => {
      state.uploadError = null;
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchKnowledgeDocuments.pending, (state) => {
        state.isLoading = true;
        state.loadError = null;
      })
      .addCase(fetchKnowledgeDocuments.fulfilled, (state, action) => {
        state.isLoading = false;
        state.documents = action.payload.documents;
        state.maxDocuments = action.payload.max_documents;
      })
      .addCase(fetchKnowledgeDocuments.rejected, (state, action) => {
        state.isLoading = false;
        state.loadError = action.payload as string;
      })

      .addCase(uploadKnowledgeDocument.pending, (state) => {
        state.isUploading = true;
        state.uploadError = null;
      })
      .addCase(uploadKnowledgeDocument.fulfilled, (state, action) => {
        state.isUploading = false;
        state.documents = [action.payload, ...state.documents];
      })
      .addCase(uploadKnowledgeDocument.rejected, (state, action) => {
        state.isUploading = false;
        state.uploadError = action.payload as string;
      })

      .addCase(retryKnowledgeDocument.pending, (state, action) => {
        state.busyIds.push(action.meta.arg);
        state.actionError = null;
      })
      .addCase(retryKnowledgeDocument.fulfilled, (state, action) => {
        state.busyIds = state.busyIds.filter((id) => id !== action.meta.arg);
        state.documents = state.documents.map((d) => (d.id === action.payload.id ? action.payload : d));
      })
      .addCase(retryKnowledgeDocument.rejected, (state, action) => {
        state.busyIds = state.busyIds.filter((id) => id !== action.meta.arg);
        state.actionError = action.payload as string;
      })

      .addCase(deleteKnowledgeDocument.pending, (state, action) => {
        state.busyIds.push(action.meta.arg);
        state.actionError = null;
      })
      .addCase(deleteKnowledgeDocument.fulfilled, (state, action) => {
        state.busyIds = state.busyIds.filter((id) => id !== action.payload);
        state.documents = state.documents.filter((d) => d.id !== action.payload);
      })
      .addCase(deleteKnowledgeDocument.rejected, (state, action) => {
        state.busyIds = state.busyIds.filter((id) => id !== action.meta.arg);
        state.actionError = action.payload as string;
      });
  },
});

export const { clearKnowledgeErrors } = knowledgeSlice.actions;
export default knowledgeSlice.reducer;
