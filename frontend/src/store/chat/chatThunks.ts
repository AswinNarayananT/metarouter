import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { ApiChatMessage, ApiConversation, ApiTeamMemberRef, ConversationStatusValue } from '@/types/realtimeTypes';

// Search and the AI / human tabs filter in the browser, so one page of the most recent chats is enough for now
const CONVERSATIONS_PAGE_SIZE = 100;

export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<{ conversations: ApiConversation[]; total: number }>('/api/v1/conversations/', {
        params: { page_size: CONVERSATIONS_PAGE_SIZE },
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load conversations'));
    }
  }
);

const MESSAGES_PAGE_SIZE = 50;

// Newest page when beforeId is empty; older pages as the agent scrolls back
export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async ({ conversationId, beforeId }: { conversationId: number; beforeId?: number | null }, { rejectWithValue }) => {
    try {
      const response = await api.get<{ messages: ApiChatMessage[]; has_more: boolean; next_before_id: number | null }>(
        `/api/v1/conversations/${conversationId}/messages`,
        { params: { limit: MESSAGES_PAGE_SIZE, ...(beforeId ? { before_id: beforeId } : {}) } }
      );
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load messages'));
    }
  }
);

// Agent reply: saved as pending and queued; ticks follow over the WebSocket
export const sendAgentMessage = createAsyncThunk(
  'chat/sendAgentMessage',
  async ({ conversationId, content }: { conversationId: number; content: string }, { rejectWithValue }) => {
    try {
      const response = await api.post<{ messages: ApiChatMessage[]; conversation_status: ConversationStatusValue; assigned_to: ApiTeamMemberRef | null }>(
        `/api/v1/conversations/${conversationId}/messages`,
        { content }
      );
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to send the message'));
    }
  }
);

export const updateConversationStatus = createAsyncThunk(
  'chat/updateConversationStatus',
  async ({ conversationId, status }: { conversationId: number; status: ConversationStatusValue }, { rejectWithValue }) => {
    try {
      const response = await api.patch<ApiConversation>(`/api/v1/conversations/${conversationId}`, { status });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update the conversation'));
    }
  }
);

// Give the chat to a team member (userId) or put it back in the unassigned queue (null)
export const assignConversation = createAsyncThunk(
  'chat/assignConversation',
  async ({ conversationId, userId }: { conversationId: number; userId: number | null }, { rejectWithValue }) => {
    try {
      const response = await api.patch<ApiConversation>(`/api/v1/conversations/${conversationId}/assign`, { user_id: userId });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to assign the conversation'));
    }
  }
);
