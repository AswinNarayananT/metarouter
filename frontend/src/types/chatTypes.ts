/* Customer chat types — mirror the backend Conversation / ChatMessage shapes */

export type ConversationStatus = 'active' | 'human_takeover';
export type Sender = 'user' | 'model' | 'human';

export interface ParsedDocument {
  status: 'parsed' | 'processing' | 'failed';
  documentType?: string;
  confidence?: number; // 0–1
  fields?: { label: string; value: string }[];
  lineItems?: { description: string; qty: number; amount: string }[];
  totals?: { label: string; value: string; emphasis?: boolean }[];
}

export interface ChatAttachment {
  kind: 'image' | 'pdf';
  fileName: string;
  size: string;
  url?: string;
  parsed: ParsedDocument;
}

export interface ChatMessage {
  id: number;
  sender: Sender;
  content: string;
  time: string;
  read?: boolean;
  attachment?: ChatAttachment;
}

export interface ChatConversation {
  id: number;
  name: string;
  phone: string;
  status: ConversationStatus;
  unread: number;
  lastActive: string;
  messages: ChatMessage[];
}

export type ChatFilterTab = 'all' | 'ai' | 'human';

export type ChatFilterCounts = Record<ChatFilterTab, number>;

/** Right sidebar: contact info, or a document the customer sent (by message id) */
export type ChatSidePanel = { type: 'contact' } | { type: 'document'; messageId: number } | null;
