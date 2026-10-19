import { api } from '@/api/axios';
import { WS_BASE_URL } from '@/api/config';
import type { RealtimeEvent, RealtimeEventMap, RealtimeEventType, RealtimeStatus } from '@/types/realtimeTypes';

/*
 * One WebSocket per browser tab for live chat updates.
 *  1. Ask the API for a short-lived ticket (axios adds the login token and refreshes it if expired)
 *  2. Open the socket with the ticket; the server joins it to the workspace + user groups
 *  3. Pages subscribe to the chats they show; subscriptions are re-sent after every reconnect
 *  4. Closed for any reason while logged in: fetch a new ticket and reconnect with backoff
 */

const TICKET_URL = '/api/v1/realtime/ticket';
const SOCKET_URL = `${WS_BASE_URL.replace(/\/$/, '')}/api/v1/realtime/ws`;
const PING_INTERVAL_MS = 25_000; // Keeps proxies / load balancers from dropping an idle socket
const MAX_RETRY_DELAY_MS = 30_000;

type Handler<T extends RealtimeEventType> = (data: RealtimeEventMap[T]) => void;
type AnyHandler = (data: unknown) => void;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private status: RealtimeStatus = 'idle';
  private running = false;
  private generation = 0; // Bumped on every start / stop so late callbacks of an old socket are ignored
  private attempts = 0;
  private hasConnectedBefore = false;
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;

  private handlers = new Map<RealtimeEventType, Set<AnyHandler>>();
  private statusListeners = new Set<() => void>();
  private reconnectListeners = new Set<() => void>();
  private subscriptions = new Map<number, number>(); // conversation id -> how many components want it

  // ---- lifecycle ----

  start() {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    window.addEventListener('online', this.handleOnline);
    void this.open(this.generation);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    this.attempts = 0;
    this.hasConnectedBefore = false;
    window.removeEventListener('online', this.handleOnline);
    this.clearTimers();
    this.socket?.close(1000, 'Logged out');
    this.socket = null;
    this.setStatus('idle');
  }

  private async open(generation: number) {
    this.setStatus(this.hasConnectedBefore ? 'reconnecting' : 'connecting');

    // 1. Ticket (a failed request just retries later; a dead session is redirected to login by axios)
    let ticket: string;
    try {
      const response = await api.post<{ ticket: string }>(TICKET_URL);
      ticket = response.data.ticket;
    } catch {
      if (generation === this.generation) this.scheduleReconnect();
      return;
    }
    if (generation !== this.generation) return; // Stopped while waiting

    // 2. Socket
    const socket = new WebSocket(`${SOCKET_URL}?ticket=${encodeURIComponent(ticket)}`);
    this.socket = socket;

    socket.onopen = () => {
      if (socket !== this.socket) return;
      const isReconnect = this.hasConnectedBefore;
      this.attempts = 0;
      this.hasConnectedBefore = true;
      this.setStatus('open');

      // 3. Re-join the chats that are on screen
      this.subscriptions.forEach((_count, conversationId) => this.send({ action: 'subscribe', conversation_id: conversationId }));
      this.pingTimer = window.setInterval(() => this.send({ action: 'ping' }), PING_INTERVAL_MS);

      // Events sent while we were offline are lost: let pages refetch
      if (isReconnect) this.reconnectListeners.forEach((listener) => listener());
    };

    socket.onmessage = (message) => {
      if (socket !== this.socket) return;
      let event: RealtimeEvent;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      this.handlers.get(event.type)?.forEach((handler) => handler(event.data));
    };

    // 4. Any close while logged in (4401 = ticket expired / reused, network drop, server restart) -> reconnect
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.clearTimers();
      if (this.running) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (!this.running || this.retryTimer !== null) return;
    this.setStatus('reconnecting');
    // 1s, 2s, 4s ... up to 30s, with jitter so every tab doesn't reconnect at the same moment
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** this.attempts) * (0.75 + Math.random() * 0.5);
    this.attempts += 1;
    const generation = this.generation;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (generation === this.generation) void this.open(generation);
    }, delay);
  }

  // Network came back: retry now instead of waiting out the backoff
  private handleOnline = () => {
    if (!this.running || this.socket) return;
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.attempts = 0;
    void this.open(this.generation);
  };

  private clearTimers() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }

  private send(payload: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  // ---- status ----

  private setStatus(status: RealtimeStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((listener) => listener());
  }

  getStatus = (): RealtimeStatus => this.status;

  onStatusChange = (listener: () => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  onReconnect(listener: () => void) {
    this.reconnectListeners.add(listener);
    return () => {
      this.reconnectListeners.delete(listener);
    };
  }

  // ---- events ----

  on<T extends RealtimeEventType>(type: T, handler: Handler<T>) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    const handlers = this.handlers.get(type)!;
    handlers.add(handler as AnyHandler);
    return () => {
      handlers.delete(handler as AnyHandler);
    };
  }

  // ---- chat subscriptions (counted, so two components showing the same chat don't unsubscribe each other) ----

  subscribeConversation(conversationId: number) {
    const count = this.subscriptions.get(conversationId) ?? 0;
    this.subscriptions.set(conversationId, count + 1);
    if (count === 0) this.send({ action: 'subscribe', conversation_id: conversationId });

    return () => {
      const current = this.subscriptions.get(conversationId) ?? 0;
      if (current <= 1) {
        this.subscriptions.delete(conversationId);
        this.send({ action: 'unsubscribe', conversation_id: conversationId });
      } else {
        this.subscriptions.set(conversationId, current - 1);
      }
    };
  }
}

export const realtimeClient = new RealtimeClient();
