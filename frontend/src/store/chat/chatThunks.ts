import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { RootState } from '@/store';
import type { ChatFilterCounts } from '@/types/chatTypes';
import type { ApiChatMessage, ApiConversation, ApiTeamMemberRef, ConversationStatusValue } from '@/types/realtimeTypes';

// Search and the AI / human tabs filter in the browser, so one page of the most recent chats is enough for now
const CONVERSATIONS_PAGE_SIZE = 30; // More load as the agent scrolls down the list

// Current tab + search from the store -> server filters (page 1 replaces the list, later pages append)
export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  async ({ page = 1 }: { page?: number } = {}, { getState, rejectWithValue }) => {
    const { listFilter, listSearch } = (getState() as RootState).chat;
    const params: Record<string, string | number> = { page, page_size: CONVERSATIONS_PAGE_SIZE };
    if (listFilter === 'mine') params.assigned = 'me';
    if (listFilter === 'unassigned') {
      params.status = 'human_takeover';
      params.assigned = 'unassigned';
    }
    if (listFilter === 'ai') params.status = 'active';
    if (listSearch.trim()) params.search = listSearch.trim();

    try {
      const response = await api.get<{ conversations: ApiConversation[]; total: number; page: number; total_pages: number }>('/api/v1/conversations/', { params });
      // Which query this page belongs to: a slow answer for an old tab / search is ignored
      return { ...response.data, query: `${listFilter}|${listSearch.trim()}` };
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load conversations'));
    }
  }
);

// Numbers on the All / Mine / Unassigned / AI tabs
export const fetchConversationCounts = createAsyncThunk(
  'chat/fetchConversationCounts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<ChatFilterCounts>('/api/v1/conversations/counts');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load chat counts'));
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

type AgentReplyResponse = { messages: ApiChatMessage[]; conversation_status: ConversationStatusValue; assigned_to: ApiTeamMemberRef | null };

// Override the client's JSON default so axios sends multipart with a boundary
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

// Agent sends an image / document (the text is its caption); uploaded to WhatsApp by the send task
export const sendAgentAttachment = createAsyncThunk(
  'chat/sendAgentAttachment',
  async ({ conversationId, file, caption }: { conversationId: number; file: File; caption: string }, { rejectWithValue }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (caption.trim()) formData.append('caption', caption.trim());
    try {
      const response = await api.post<AgentReplyResponse>(`/api/v1/conversations/${conversationId}/attachments`, formData, MULTIPART);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to send the file'));
    }
  }
);

// Approved WhatsApp template: works outside the 24-hour window; the customer's reply reopens free text
export const sendAgentTemplate = createAsyncThunk(
  'chat/sendAgentTemplate',
  async (
    { conversationId, templateName, language, parameters }: { conversationId: number; templateName: string; language: string; parameters: string[] },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.post<AgentReplyResponse>(`/api/v1/conversations/${conversationId}/template`, {
        template_name: templateName,
        language,
        parameters,
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to send the template'));
    }
  }
);
