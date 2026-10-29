import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { attachmentReceived, conversationReadElsewhere, conversationReceived, messageReceived, messageStatusReceived, ticketChanged } from '@/store/chat/chatSlice';
import { fetchConversationCounts, fetchConversations, fetchMessages } from '@/store/chat/chatThunks';
import { notificationReceived, notificationsReadElsewhere } from '@/store/notifications/notificationSlice';
import { fetchNotifications } from '@/store/notifications/notificationThunks';
import { ticketReceived } from '@/store/tickets/ticketSlice';
import { fetchTicketDetail, fetchTickets } from '@/store/tickets/ticketThunks';
import { fetchCurrentUser } from '@/store/workspace/workspaceThunks';
import { logoutWorkspace } from '@/store/workspace/workspaceSlice';
import { notifyError, notifySuccess } from '@/utils/notify';
import { useConversationSubscription, useRealtimeEvent, useRealtimeReconnect } from './useRealtime';

const REFETCH_DEBOUNCE_MS = 1000; // A broadcast sends one "changed" per batch; batches can come close together

// Mount once in the workspace layout: keeps the chat list in the store live on every page
export function useChatListRealtimeSync() {
  const dispatch = useAppDispatch();
  const hasLoaded = useAppSelector((state) => state.chat.hasLoaded);
  const refetchTimer = useRef<number | null>(null);

  // 1. One chat changed (new message, takeover on / off, AI handed it over)
  useRealtimeEvent('conversation.updated', (conversation) => dispatch(conversationReceived(conversation)));
  useRealtimeEvent('conversation.handover', (conversation) => dispatch(conversationReceived(conversation)));
  useRealtimeEvent('conversation.assigned', (conversation) => dispatch(conversationReceived(conversation)));
  useRealtimeEvent('ticket.updated', (ticket) => dispatch(ticketChanged(ticket)));
  useRealtimeEvent('conversation.read', (update) => dispatch(conversationReadElsewhere(update)));

  // 2. Many chats changed, or we were offline and missed events: reload the list (only if it was loaded)
  const refetch = () => {
    if (!hasLoaded) return;
    if (refetchTimer.current !== null) window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      dispatch(fetchConversations({ page: 1 }));
      dispatch(fetchConversationCounts());
    }, REFETCH_DEBOUNCE_MS);
  };
  useRealtimeEvent('conversations.changed', refetch);
  useRealtimeReconnect(refetch);

  useEffect(
    () => () => {
      if (refetchTimer.current !== null) window.clearTimeout(refetchTimer.current);
    },
    []
  );
}

// Mount on the chats page: live messages, ticks and attachment updates for the open chat
export function useOpenChatRealtimeSync(conversationId: number | null) {
  const dispatch = useAppDispatch();

  // 1. Join the chat's group on the server while it's open
  useConversationSubscription(conversationId);

  // 2. Events only arrive for subscribed chats; the slice ignores chats whose messages aren't loaded
  useRealtimeEvent('message.new', (message) => dispatch(messageReceived(message)));
  useRealtimeEvent('message.status', (update) => dispatch(messageStatusReceived(update)));
  useRealtimeEvent('attachment.updated', (update) => dispatch(attachmentReceived(update)));

  // 3. Back from offline: reload the newest page to pick up what was missed (merged by id)
  useRealtimeReconnect(() => {
    if (conversationId !== null) dispatch(fetchMessages({ conversationId }));
  });
}

// Mount once in the workspace layout: the bell's list and unread count, live
export function useNotificationsRealtimeSync() {
  const dispatch = useAppDispatch();

  // 1. Load on login / page load (also catches what arrived while logged out)
  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  // 2. New ones, and ones read in another tab
  useRealtimeEvent('notification.new', (notification) => {
    dispatch(notificationReceived(notification));
    // An admin changed this user's role: reload it so the menu and permissions match right away
    if (notification.type === 'role_changed') {
      dispatch(fetchCurrentUser());
      notifySuccess(notification.title);
    }
  });
  useRealtimeEvent('notifications.read', (update) => dispatch(notificationsReadElsewhere(update)));

  // 3. Removed by an admin, or left (in this tab or another): sign out now (the route guard sends them to the login page)
  useRealtimeEvent('member.removed', ({ message, reason }) => {
    if (reason === 'left') notifySuccess(message);
    else notifyError(message);
    dispatch(logoutWorkspace());
  });

  // 4. Back from offline: reload to pick up what was missed
  useRealtimeReconnect(() => dispatch(fetchNotifications()));
}

// Mount on the Tickets page: rows and the open ticket update live
export function useTicketsRealtimeSync() {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((state) => state.tickets.selectedId);
  const items = useAppSelector((state) => state.tickets.items);

  useRealtimeEvent('ticket.updated', (ticket) => {
    // A ticket we don't list yet (new session, or it moved into this tab): reload page 1
    if (!items.some((t) => t.id === ticket.id)) dispatch(fetchTickets({ page: 1 }));
    else dispatch(ticketReceived(ticket));
    // The open ticket also gets its new timeline / messages
    if (ticket.id === selectedId) dispatch(fetchTicketDetail(ticket.id));
  });

  useRealtimeReconnect(() => {
    dispatch(fetchTickets({ page: 1 }));
    if (selectedId !== null) dispatch(fetchTicketDetail(selectedId));
  });
}
