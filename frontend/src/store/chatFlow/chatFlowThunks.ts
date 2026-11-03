import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { ChatFlowDocument, ChatFlowResponse } from '@/types/chatFlowTypes';

// The Chat Menu page keeps the menu itself while it's edited; these only talk to the server

export const fetchChatFlow = createAsyncThunk('chatFlow/fetch', async (_, { rejectWithValue }) => {
  try {
    const response = await api.get<ChatFlowResponse>('/api/v1/chat-flow');
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, "Couldn't load the chat menu"));
  }
});

export const saveChatFlow = createAsyncThunk('chatFlow/save', async (flow: ChatFlowDocument, { rejectWithValue }) => {
  try {
    const response = await api.put<ChatFlowResponse>('/api/v1/chat-flow', flow);
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, "Couldn't save the chat menu"));
  }
});

export const resetChatFlow = createAsyncThunk('chatFlow/reset', async (_, { rejectWithValue }) => {
  try {
    const response = await api.delete<ChatFlowResponse>('/api/v1/chat-flow');
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, "Couldn't reset the chat menu"));
  }
});
