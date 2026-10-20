import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { AppNotification } from '@/types/notificationTypes';

const NOTIFICATIONS_LIMIT = 30; // Newest ones shown in the bell

export const fetchNotifications = createAsyncThunk(
  'notifications/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<{ notifications: AppNotification[]; unread_count: number }>('/api/v1/notifications/', {
        params: { limit: NOTIFICATIONS_LIMIT },
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load notifications'));
    }
  }
);

export const markNotificationRead = createAsyncThunk(
  'notifications/markRead',
  async (notificationId: number, { rejectWithValue }) => {
    try {
      const response = await api.patch<{ notification: AppNotification; unread_count: number }>(`/api/v1/notifications/${notificationId}/read`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update the notification'));
    }
  }
);

// Everything (Mark all as read), or only one chat's notifications (when the chat is opened)
export const markNotificationsRead = createAsyncThunk(
  'notifications/markAllRead',
  async ({ conversationId }: { conversationId?: number } = {}, { rejectWithValue }) => {
    try {
      const response = await api.post<{ marked: number; unread_count: number }>('/api/v1/notifications/read', {
        conversation_id: conversationId ?? null,
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update notifications'));
    }
  }
);
