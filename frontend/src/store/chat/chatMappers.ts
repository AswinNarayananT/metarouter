import type { ApiAttachment, ApiChatMessage, ApiConversation } from '@/types/realtimeTypes';
import type { ChatAttachment, ChatConversation, ChatMessage, ParsedDocument } from '@/types/chatTypes';

/* API shapes (snake_case, ISO times) -> the shapes the chat components render */

// "10:42 AM" today, "Yesterday", "Mon" this week, "12 Oct" before that
export function formatListTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (date.getTime() >= startOfToday) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.getTime() >= startOfToday - dayMs) return 'Yesterday';
  if (date.getTime() >= startOfToday - 6 * dayMs) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// WhatsApp sends digits only (917034327569); show them as an international number
export function formatPhone(digits: string): string {
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function mapParsed(attachment: ApiAttachment): ParsedDocument {
  const data = (attachment.parsed_data ?? {}) as Pick<ParsedDocument, 'fields' | 'totals'> & { line_items?: ParsedDocument['lineItems'] };
  let status: ParsedDocument['status'] = 'failed';
  if (attachment.parse_status === 'parsed') status = 'parsed';
  else if (attachment.parse_status === 'pending' && attachment.download_status !== 'failed') status = 'processing';
  else if (attachment.parse_status === 'skipped' && attachment.download_status === 'done') status = 'skipped';

  return {
    status,
    note: attachment.error ?? undefined,
    documentType: attachment.document_type ?? undefined,
    confidence: attachment.confidence ?? undefined,
    fields: data.fields,
    lineItems: data.line_items,
    totals: data.totals,
  };
}

// Images and PDFs can be previewed; anything else is offered as a download
function attachmentKind(attachment: ApiAttachment): ChatAttachment['kind'] {
  if (attachment.mime_type?.startsWith('image/') || (!attachment.mime_type && attachment.kind === 'image')) return 'image';
  if (attachment.mime_type === 'application/pdf') return 'pdf';
  return 'file';
}

function fileExtension(fileName: string | null, mimeType: string | null): string {
  const fromName = fileName?.includes('.') ? fileName.split('.').pop() : null;
  const fromMime = mimeType?.split('/').pop()?.replace('jpeg', 'jpg');
  return (fromName || fromMime || 'file').slice(0, 4).toUpperCase();
}

export function mapAttachment(attachment: ApiAttachment): ChatAttachment {
  const kind = attachmentKind(attachment);
  return {
    id: attachment.id,
    kind,
    fileName: attachment.file_name || (kind === 'image' ? 'Photo' : 'Document'),
    extension: fileExtension(attachment.file_name, attachment.mime_type),
    mimeType: attachment.mime_type,
    size: formatBytes(attachment.file_size),
    downloadStatus: attachment.download_status,
    parsed: mapParsed(attachment),
  };
}

export function mapMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: message.id,
    sender: message.sender,
    content: message.content,
    time: new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    createdAt: message.created_at,
    read: message.status === 'read',
    attachment: message.attachment ? mapAttachment(message.attachment) : undefined,
    status: message.status,
    error: message.error,
    sentBy: message.sent_by,
  };
}

// `existing` keeps what only the browser knows: unread count and the loaded messages
export function mapConversation(conversation: ApiConversation, existing?: ChatConversation): ChatConversation {
  const lastActivityAt = conversation.last_message?.created_at ?? conversation.updated_at;
  const phone = formatPhone(conversation.customer_phone);
  const referral = conversation.ad_referral;

  return {
    id: conversation.id,
    name: conversation.customer_name || phone,
    hasName: Boolean(conversation.customer_name),
    phone,
    adReferral: referral
      ? { headline: referral.headline, body: referral.body, sourceType: referral.source_type, sourceUrl: referral.source_url }
      : null,
    status: conversation.status,
    assignedTo: conversation.assigned_to,
    unread: existing?.unread ?? 0,
    lastActive: formatListTime(lastActivityAt),
    lastActivityAt,
    lastMessage: conversation.last_message ? mapMessage(conversation.last_message) : null,
    businessNumber: conversation.display_phone_number,
    windowOpen: conversation.window_open,
    windowExpiresAt: conversation.window_expires_at,
    messages: existing?.messages ?? [],
  };
}
