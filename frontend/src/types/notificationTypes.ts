/* Notifications — mirror GET /api/v1/notifications (backend notification_service.serialize_notification) */

export type NotificationType = 'handover' | 'assigned' | 'ticket_assigned';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;                // "A customer needs a human"
  body: string | null;          // "Aswin_nt · I want to talk to a real person"
  conversation_id: number | null;
  ticket: { id: number; number: number } | null; // Ticket assignments open the ticket
  actor: { id: number; name: string } | null; // Who caused it (null = the AI)
  read_at: string | null;       // null = unread
  created_at: string;
}

export type NotificationTab = 'unread' | 'all';

export interface NotificationState {
  items: AppNotification[];     // Loaded pages of the current tab, newest first
  tab: NotificationTab;
  hasMore: boolean;             // Older ones to load on scroll
  unreadCount: number;          // True total from the server (not just the loaded ones)
  hasLoaded: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
}
