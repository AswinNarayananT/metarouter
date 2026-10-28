// Shapes from backend/app/api/v1/quick_replies.py
export type QuickReplyScope = 'shared' | 'personal'; // shared = the whole team, personal = only the member who saved it

export interface QuickReply {
  id: number;
  shortcut: string; // Typed after "/", lowercase
  content: string;  // May hold {customer_name}, {agent_name}, {business_name}
  scope: QuickReplyScope;
  can_edit: boolean;
}

export interface QuickReplyInput {
  shortcut: string;
  content: string;
}

export interface QuickRepliesState {
  items: QuickReply[];
  hasLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
}
