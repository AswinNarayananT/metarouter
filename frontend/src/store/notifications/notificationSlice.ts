import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppNotification, NotificationState } from '@/types/notificationTypes';
import type { RealtimeEventMap } from '@/types/realtimeTypes';
import { fetchNotifications, markNotificationRead, markNotificationsRead } from './notificationThunks';

const MAX_ITEMS = 50; // Keep the bell list short; older ones are still in the database

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
  hasLoaded: false,
  isLoading: false,
  loadError: null,
};

function markRead(items: AppNotification[], predicate: (n: AppNotification) => boolean) {
  const now = new Date().toISOString();
  items.forEach((n) => {
    if (!n.read_at && predicate(n)) n.read_at = now;
  });
}

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    // notification.new event
    notificationReceived: (state, action: PayloadAction<AppNotification>) => {
      if (state.items.some((n) => n.id === action.payload.id)) return;
      state.items = [action.payload, ...state.items].slice(0, MAX_ITEMS);
      if (!action.payload.read_at) state.unreadCount += 1;
    },
    // notifications.read event: read in another tab
    notificationsReadElsewhere: (state, action: PayloadAction<RealtimeEventMap['notifications.read']>) => {
      const ids = new Set(action.payload.ids);
      markRead(state.items, (n) => ids.has(n.id));
      state.unreadCount = action.payload.unread_count;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.isLoading = true;
        state.loadError = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.isLoading = false;
        state.hasLoaded = true;
        state.items = action.payload.notifications;
        state.unreadCount = action.payload.unread_count;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false;
        state.loadError = action.payload as string;
      })

      // Optimistic: the item looks read immediately; the server count corrects it
      .addCase(markNotificationRead.pending, (state, action) => {
        markRead(state.items, (n) => n.id === action.meta.arg);
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        state.unreadCount = action.payload.unread_count;
      })

      .addCase(markNotificationsRead.pending, (state, action) => {
        const conversationId = action.meta.arg?.conversationId;
        markRead(state.items, (n) => conversationId === undefined || n.conversation_id === conversationId);
      })
      .addCase(markNotificationsRead.fulfilled, (state, action) => {
        state.unreadCount = action.payload.unread_count;
      })

      // Logged out: never show one user's notifications to the next one
      .addMatcher((action) => action.type === 'workspace/logoutWorkspace', () => initialState);
  },
});

export const { notificationReceived, notificationsReadElsewhere } = notificationSlice.actions;
export default notificationSlice.reducer;
