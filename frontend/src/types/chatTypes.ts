/* Customer chat types — mirror the backend Conversation / ChatMessage shapes */

export type ConversationStatus = 'active' | 'human_takeover';
export type Sender = 'user' | 'model' | 'human' | 'broadcast' | 'system'; // system = activity line
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ParsedDocument {
  status: 'parsed' | 'processing' | 'failed' | 'skipped'; // skipped = file type / size isn't read automatically
  note?: string; // Why it was skipped or failed
  documentType?: string;
  confidence?: number; // 0–1
  fields?: { label: string; value: string }[];
  lineItems?: { description: string; qty: number; amount: string }[];
  totals?: { label: string; value: string; emphasis?: boolean }[];
}

export interface ChatAttachment {
  id: number;
  kind: 'image' | 'pdf' | 'file' | 'audio' | 'video' | 'sticker'; // file = any other document (download only)
  fileName: string;
  extension: string; // Badge on the card: PDF, JPG, MD ...
  mimeType: string | null;
  size: string;
  downloadStatus: 'pending' | 'done' | 'failed'; // The file is fetched (with the login token) once it's 'done'
  transcript?: { text: string; language: string; english: string } | null; // Voice notes
  parsed: ParsedDocument;
}

export interface ChatMessage {
  id: number;
  sender: Sender;
  content: string;
  time: string;
  createdAt: string; // ISO, for date separators
  read?: boolean;
  attachment?: ChatAttachment;
  status?: DeliveryStatus | null; // Outgoing messages only
  error?: string | null;          // Why sending failed
  sentBy?: { id: number; name: string } | null; // Team member's first name on agent replies
  messageType?: string;           // text, template, image, audio, location ...
  reaction?: string | null;       // Customer's emoji reaction to this message
  location?: { latitude: number; longitude: number; name: string | null; address: string | null } | null;
}

export interface ChatAdReferral {
  headline: string | null;
  body: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
}

export interface ChatConversation {
  id: number;
  name: string;                    // WhatsApp profile name, or the number when we don't know it
  hasName: boolean;                // false = `name` is just the number
  phone: string;
  adReferral: ChatAdReferral | null; // Click-to-WhatsApp ad the customer came from
  status: ConversationStatus;
  assignedTo: { id: number; name: string } | null; // null = unassigned
  openTicket: { id: number; number: number; status: string } | null; // Current support session (ticket)
  unread: number;
  lastActive: string;
  lastActivityAt: string | null;   // ISO time of the last message, for sorting
  lastMessage: ChatMessage | null; // Chat list preview
  businessNumber: string | null;   // Which of the workspace's WhatsApp numbers the chat is on
  windowOpen: boolean;             // Free-text replies allowed (24 hours since the customer's last message)
  windowExpiresAt: string | null;
  messages: ChatMessage[];         // Loaded when the chat is opened
}

// Paging / loading state of one chat's messages (exists once the chat has been opened)
export interface ChatThread {
  isLoading: boolean;
  loadError: string | null;
  hasMore: boolean;
  nextBeforeId: number | null;
}

export interface ChatState {
  conversations: ChatConversation[];
  // Chat list paging: the server filters by tab + search and sends 30 at a time as the agent scrolls
  listFilter: ChatFilterTab;
  listSearch: string;
  listPage: number;
  hasMoreChats: boolean;
  isLoadingMore: boolean;
  tabCounts: ChatFilterCounts | null; // Totals for the tabs (from the server, not the loaded page)
  threads: Record<number, ChatThread>;
  sendingId: number | null; // Chat whose reply is being sent
  selectedId: number | null;
  hasLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  updatingStatusId: number | null; // Chat whose takeover switch is saving
  updatingAssignmentId: number | null; // Chat whose owner is being changed
  actionError: string | null;
}

// mine = assigned to me; unassigned = needs a human and nobody owns it; ai = the AI is handling it
export type ChatFilterTab = 'all' | 'mine' | 'unassigned' | 'ai';

export type ChatFilterCounts = Record<ChatFilterTab, number>;

/** Right sidebar: contact info, or a document the customer sent (by message id) */
export type ChatSidePanel = { type: 'contact' } | { type: 'document'; messageId: number } | null;
