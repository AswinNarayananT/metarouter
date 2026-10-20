/* Notifications — mirror GET /api/v1/notifications (backend notification_service.serialize_notification) */

export type NotificationType = 'handover' | 'assigned';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;                // "A customer needs a human"
  body: string | null;          // "Aswin_nt · I want to talk to a real person"
  conversation_id: number | null;
  actor: { id: number; name: string } | null; // Who caused it (null = the AI)
  read_at: string | null;       // null = unread
  created_at: string;
}

export interface NotificationState {
  items: AppNotification[];
  unreadCount: number;
  hasLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
}
