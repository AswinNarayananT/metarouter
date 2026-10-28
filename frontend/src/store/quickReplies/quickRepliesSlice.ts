import { createSlice } from '@reduxjs/toolkit';
import type { QuickRepliesState, QuickReply } from '@/types/quickReplyTypes';
import { createQuickReply, deleteQuickReply, fetchQuickReplies, updateQuickReply } from './quickRepliesThunks';

const initialState: QuickRepliesState = {
  items: [],
  hasLoaded: false,
  isLoading: false,
  loadError: null,
};

// Same order as the server: by shortcut, shared before personal
function sortReplies(items: QuickReply[]) {
  items.sort((a, b) => a.shortcut.localeCompare(b.shortcut) || (a.scope === b.scope ? 0 : a.scope === 'shared' ? -1 : 1));
}

const quickRepliesSlice = createSlice({
  name: 'quickReplies',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuickReplies.pending, (state) => {
        state.isLoading = true;
        state.loadError = null;
      })
      .addCase(fetchQuickReplies.fulfilled, (state, action) => {
        state.isLoading = false;
        state.hasLoaded = true;
        state.items = action.payload;
      })
      .addCase(fetchQuickReplies.rejected, (state, action) => {
        state.isLoading = false;
        state.loadError = action.payload as string;
      })
      .addCase(createQuickReply.fulfilled, (state, action) => {
        state.items.push(action.payload);
        sortReplies(state.items);
      })
      .addCase(updateQuickReply.fulfilled, (state, action) => {
        state.items = state.items.map((r) => (r.id === action.payload.id ? action.payload : r));
        sortReplies(state.items);
      })
      .addCase(deleteQuickReply.fulfilled, (state, action) => {
        state.items = state.items.filter((r) => r.id !== action.payload);
      })
      // Another member signs in next: never show the previous member's personal replies
      .addCase('workspace/logoutWorkspace', () => initialState);
  },
});

export default quickRepliesSlice.reducer;
