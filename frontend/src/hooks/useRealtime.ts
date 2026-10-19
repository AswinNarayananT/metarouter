import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAppSelector } from '@/store';
import { realtimeClient } from '@/realtime/realtimeClient';
import type { RealtimeEventMap, RealtimeEventType, RealtimeStatus } from '@/types/realtimeTypes';

// Mount once in the workspace layout: connected while logged in, closed on logout
export function useRealtimeConnection() {
  const token = useAppSelector((state) => state.workspace.token);

  useEffect(() => {
    if (!token) return;
    realtimeClient.start();
    return () => realtimeClient.stop();
    // A refreshed token doesn't need a new socket; only logging in / out does
  }, [Boolean(token)]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(realtimeClient.onStatusChange, realtimeClient.getStatus);
}

// Calls the latest handler for every event of this type (no need to memoize the handler)
export function useRealtimeEvent<T extends RealtimeEventType>(type: T, handler: (data: RealtimeEventMap[T]) => void) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => realtimeClient.on(type, (data) => handlerRef.current(data)), [type]);
}

// Live messages / ticks for the chat on screen; pass null when no chat is open
export function useConversationSubscription(conversationId: number | null) {
  useEffect(() => {
    if (conversationId === null) return;
    return realtimeClient.subscribeConversation(conversationId);
  }, [conversationId]);
}

// After a dropped connection comes back, events sent in between are lost: refetch
export function useRealtimeReconnect(callback: () => void) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => realtimeClient.onReconnect(() => callbackRef.current()), []);
}
