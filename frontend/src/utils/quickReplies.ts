import type { QuickReply } from '@/types/quickReplyTypes';

export const QUICK_REPLY_MAX_CHARS = 4096; // One WhatsApp text message (checked again by the server)
export const SHORTCUT_PATTERN = /^[a-z0-9_-]{1,30}$/;

// Filled in when a reply is inserted; the member still sees and can edit the result before sending
export const QUICK_REPLY_PLACEHOLDERS = [
  { token: '{customer_name}', label: 'Customer name' },
  { token: '{agent_name}', label: 'Your name' },
  { token: '{business_name}', label: 'Business name' },
];

function firstName(name?: string | null): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

export function fillPlaceholders(
  content: string,
  values: { customerName?: string | null; agentName?: string | null; businessName?: string | null }
): string {
  return content.replace(/\{(customer_name|agent_name|business_name)\}/g, (_, key: string) => {
    if (key === 'customer_name') return firstName(values.customerName) || 'there'; // "Hi there" when WhatsApp gave no name
    if (key === 'agent_name') return firstName(values.agentName);
    return values.businessName || '';
  });
}

// "/ref" -> replies whose shortcut matches, best first; the button's search also looks in the text
export function matchQuickReplies(replies: QuickReply[], query: string, searchContent: boolean): QuickReply[] {
  const q = query.trim().toLowerCase().replace(/^\//, '');
  if (!q) return replies;
  const starts = replies.filter((r) => r.shortcut.startsWith(q));
  const rest = replies.filter(
    (r) => !r.shortcut.startsWith(q) && (r.shortcut.includes(q) || (searchContent && r.content.toLowerCase().includes(q)))
  );
  return [...starts, ...rest];
}
