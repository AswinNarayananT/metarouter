import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { QuickReply, QuickReplyInput } from '@/types/quickReplyTypes';

// The team's shared replies plus the current member's own
export const fetchQuickReplies = createAsyncThunk('quickReplies/fetch', async (_, { rejectWithValue }) => {
  try {
    const response = await api.get<{ quick_replies: QuickReply[] }>('/api/v1/quick-replies');
    return response.data.quick_replies;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Failed to load quick replies'));
  }
});

export const createQuickReply = createAsyncThunk(
  'quickReplies/create',
  async (payload: QuickReplyInput & { shared: boolean }, { rejectWithValue }) => {
    try {
      const response = await api.post<QuickReply>('/api/v1/quick-replies', payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to save the quick reply'));
    }
  }
);

export const updateQuickReply = createAsyncThunk(
  'quickReplies/update',
  async ({ id, ...payload }: QuickReplyInput & { id: number }, { rejectWithValue }) => {
    try {
      const response = await api.patch<QuickReply>(`/api/v1/quick-replies/${id}`, payload);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to save the quick reply'));
    }
  }
);

export const deleteQuickReply = createAsyncThunk('quickReplies/delete', async (id: number, { rejectWithValue }) => {
  try {
    await api.delete(`/api/v1/quick-replies/${id}`);
    return id;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Failed to delete the quick reply'));
  }
});
