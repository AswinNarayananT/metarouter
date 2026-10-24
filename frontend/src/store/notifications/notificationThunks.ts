import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { AppNotification, NotificationTab } from '@/types/notificationTypes';
import type { RootState } from '@/store';

const NOTIFICATIONS_PAGE_SIZE = 15; // The bell shows ~7 at once; more load on scroll

interface NotificationPage {
  notifications: AppNotification[];
  has_more: boolean;
  unread_count: number;
}

// First page of a tab (no tab = reload the current one, e.g. after a reconnect)
export const fetchNotifications = createAsyncThunk(
  'notifications/fetch',
  async (arg: { tab?: NotificationTab } | void, { getState, rejectWithValue }) => {
    const pageTab = (arg && arg.tab) || (getState() as RootState).notifications.tab;
    try {
      const response = await api.get<NotificationPage>('/api/v1/notifications/', {
        params: { limit: NOTIFICATIONS_PAGE_SIZE, unread_only: pageTab === 'unread' },
      });
      // Which tab this page belongs to: a slow answer for the other tab is ignored
      return { ...response.data, tab: pageTab };
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load notifications'));
    }
  }
);

// Next page: older than the last one loaded
export const fetchMoreNotifications = createAsyncThunk(
  'notifications/fetchMore',
  async (_, { getState, rejectWithValue }) => {
    const { items, tab } = (getState() as RootState).notifications;
    try {
      const response = await api.get<NotificationPage>('/api/v1/notifications/', {
        params: { limit: NOTIFICATIONS_PAGE_SIZE, unread_only: tab === 'unread', before_id: items[items.length - 1]?.id },
      });
      return { ...response.data, tab };
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load more notifications'));
    }
  },
  {
    // One page at a time, and only when there is more
    condition: (_, { getState }) => {
      const { hasMore, isLoading, isLoadingMore, items } = (getState() as RootState).notifications;
      return hasMore && !isLoading && !isLoadingMore && items.length > 0;
    },
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
  async ({ conversationId, ticketId }: { conversationId?: number; ticketId?: number } = {}, { rejectWithValue }) => {
    try {
      const response = await api.post<{ marked: number; unread_count: number }>('/api/v1/notifications/read', {
        conversation_id: conversationId ?? null,
        ticket_id: ticketId ?? null,
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update notifications'));
    }
  }
);
