/* Shapes sent by the backend (conversation_service.py serializers): the REST API and the WebSocket events use the same ones */

export type ConversationStatusValue = 'active' | 'human_takeover';
export type MessageSender = 'user' | 'model' | 'human' | 'broadcast' | 'system'; // system = activity line (assigned, taken over ...)
export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ApiAttachment {
  id: number;
  kind: string;
  mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  download_status: 'pending' | 'done' | 'failed';
  parse_status: 'pending' | 'parsed' | 'failed' | 'skipped';
  document_type: string | null;
  confidence: number | null;
  parsed_data: Record<string, unknown> | null;
  error: string | null;
}

export interface ApiChatMessage {
  id: number;
  conversation_id: number;
  sender: MessageSender;
  message_type: 'text' | 'template' | 'event' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'unsupported';
  content: string;
  template_data: Record<string, unknown> | null;
  status: MessageDeliveryStatus | null; // null for customer messages
  error: string | null;
  created_at: string;
  attachment: ApiAttachment | null;
  sent_by: ApiTeamMemberRef | null; // Team member who wrote an agent reply / caused an activity line (first name)
  reaction: string | null; // Emoji the customer reacted to this message with
}

export interface ApiAdReferral {
  headline: string | null;
  body: string | null;
  source_type: string | null; // 'ad' or 'post'
  source_url: string | null;
}

export interface ApiTeamMemberRef {
  id: number;
  name: string;
}

export interface ApiConversation {
  id: number;
  customer_phone: string;
  customer_name: string | null;       // WhatsApp profile name (or broadcast contact list name)
  customer_wa_user_id: string | null; // Business-scoped user id
  ad_referral: ApiAdReferral | null;  // Click-to-WhatsApp ad the customer came from
  phone_number_id: string | null;
  display_phone_number: string | null;
  status: ConversationStatusValue;
  assigned_to: ApiTeamMemberRef | null; // Team member responsible (null = unassigned queue)
  assigned_at: string | null;
  updated_at: string | null;
  last_message: ApiChatMessage | null;
  open_ticket: { id: number; number: number; status: string } | null; // The chat's current support session
  window_open: boolean; // Free text allowed (24 hours since the customer's last message)
  window_expires_at: string | null;
  unread_count?: number; // Chat list only: this user's unread customer messages (live events don't carry it)
}

import type { AppNotification } from './notificationTypes';
import type { Ticket } from './ticketTypes';

/* WebSocket events (backend realtime/notify.py) */

export interface RealtimeEventMap {
  'message.new': ApiChatMessage;
  'message.status': Pick<ApiChatMessage, 'id' | 'conversation_id' | 'status' | 'error'>;
  'attachment.updated': { message_id: number; conversation_id: number; attachment: ApiAttachment };
  'conversation.updated': ApiConversation;
  'conversation.handover': ApiConversation;
  'conversation.assigned': ApiConversation & { assigned_by: ApiTeamMemberRef | null }; // Only to the new owner
  'conversations.changed': { reason: string };
  'notification.new': AppNotification; // Only to the recipient
  'ticket.updated': Ticket; // A ticket was opened, changed or closed
  'notifications.read': { ids: number[]; conversation_id: number | null; unread_count: number }; // Read in another tab
  'conversation.read': { conversation_id: number }; // This user opened the chat in another tab
  'member.removed': { message: string; reason: 'removed' | 'left' }; // Removed by an admin or left; the server closes the socket right after
  // Replies to what this tab sent
  subscribed: { conversation_id: number };
  unsubscribed: { conversation_id: number };
  pong: Record<string, never>;
  error: { detail: string; conversation_id?: number };
}

export type RealtimeEventType = keyof RealtimeEventMap;

export interface RealtimeEvent<T extends RealtimeEventType = RealtimeEventType> {
  type: T;
  data: RealtimeEventMap[T];
}

// idle: logged out / not started; connecting: fetching a ticket or opening; open: live; reconnecting: waiting to retry
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';
