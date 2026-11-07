import { createSlice } from '@reduxjs/toolkit';
import type { TemplatesState } from '@/types/templateTypes';
import { createMessageTemplate, deleteMessageTemplate, fetchMessageTemplates } from './templatesThunks';

const initialState: TemplatesState = {
  items: [],
  isLoading: false,
  error: null,
  isSaving: false,
  isDeleting: false,
};

const templatesSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Clear everything when the workspace user logs out
      .addCase('workspace/logoutWorkspace', () => initialState)

      .addCase(fetchMessageTemplates.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchMessageTemplates.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload;
      })
      .addCase(fetchMessageTemplates.rejected, (state, action) => {
        state.isLoading = false;
        state.items = [];
        state.error = action.payload as string;
      })

      .addCase(createMessageTemplate.pending, (state) => {
        state.isSaving = true;
      })
      .addCase(createMessageTemplate.fulfilled, (state) => {
        state.isSaving = false;
      })
      .addCase(createMessageTemplate.rejected, (state) => {
        state.isSaving = false;
      })

      .addCase(deleteMessageTemplate.pending, (state) => {
        state.isDeleting = true;
      })
      .addCase(deleteMessageTemplate.fulfilled, (state, action) => {
        state.isDeleting = false;
        state.items = state.items.filter((template) => template.name !== action.payload);
      })
      .addCase(deleteMessageTemplate.rejected, (state) => {
        state.isDeleting = false;
      });
  },
});

export default templatesSlice.reducer;
