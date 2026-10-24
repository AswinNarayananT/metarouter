import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppNotification, NotificationState } from '@/types/notificationTypes';
import type { RealtimeEventMap } from '@/types/realtimeTypes';
import { fetchMoreNotifications, fetchNotifications, markNotificationRead, markNotificationsRead } from './notificationThunks';

const initialState: NotificationState = {
  items: [],
  tab: 'unread', // What still needs attention comes first
  hasMore: false,
  unreadCount: 0,
  hasLoaded: false,
  isLoading: false,
  isLoadingMore: false,
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
    // notification.new event: new ones are unread, so they belong at the top of both tabs
    notificationReceived: (state, action: PayloadAction<AppNotification>) => {
      if (state.items.some((n) => n.id === action.payload.id)) return;
      state.items.unshift(action.payload);
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
      // Switching tab clears the list straight away (no flash of the other tab's items)
      .addCase(fetchNotifications.pending, (state, action) => {
        const tab = action.meta.arg?.tab;
        if (tab && tab !== state.tab) {
          state.tab = tab;
          state.items = [];
          state.hasMore = false;
        }
        state.isLoading = true;
        state.loadError = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.unreadCount = action.payload.unread_count;
        if (action.payload.tab !== state.tab) return;
        state.isLoading = false;
        state.hasLoaded = true;
        state.items = action.payload.notifications;
        state.hasMore = action.payload.has_more;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false;
        state.loadError = action.payload as string;
      })

      .addCase(fetchMoreNotifications.pending, (state) => {
        state.isLoadingMore = true;
      })
      .addCase(fetchMoreNotifications.fulfilled, (state, action) => {
        state.isLoadingMore = false;
        state.unreadCount = action.payload.unread_count;
        if (action.payload.tab !== state.tab) return;
        const loaded = new Set(state.items.map((n) => n.id));
        state.items.push(...action.payload.notifications.filter((n) => !loaded.has(n.id)));
        state.hasMore = action.payload.has_more;
      })
      .addCase(fetchMoreNotifications.rejected, (state) => {
        state.isLoadingMore = false;
      })

      // Optimistic: the item looks read immediately; the server count corrects it
      .addCase(markNotificationRead.pending, (state, action) => {
        markRead(state.items, (n) => n.id === action.meta.arg);
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        state.unreadCount = action.payload.unread_count;
      })

      .addCase(markNotificationsRead.pending, (state, action) => {
        const { conversationId, ticketId } = action.meta.arg ?? {};
        markRead(
          state.items,
          (n) => (conversationId === undefined || n.conversation_id === conversationId) && (ticketId === undefined || n.ticket?.id === ticketId)
        );
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
