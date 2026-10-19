import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { attachmentReceived, conversationReceived, messageReceived, messageStatusReceived } from '@/store/chat/chatSlice';
import { fetchConversations, fetchMessages } from '@/store/chat/chatThunks';
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

  // 2. Many chats changed, or we were offline and missed events: reload the list (only if it was loaded)
  const refetch = () => {
    if (!hasLoaded) return;
    if (refetchTimer.current !== null) window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = null;
      dispatch(fetchConversations());
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
