import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ChatConversation, ChatFilterTab, ChatMessage, ChatState, ConversationStatus, DeliveryStatus } from '@/types/chatTypes';
import type { ApiAttachment, ApiChatMessage, ApiConversation, RealtimeEventMap } from '@/types/realtimeTypes';
import type { Ticket } from '@/types/ticketTypes';
import { mapAttachment, mapConversation, mapMessage } from './chatMappers';
import { assignConversation, fetchConversationCounts, fetchConversations, fetchMessages, sendAgentAttachment, sendAgentMessage, sendAgentTemplate, updateConversationStatus } from './chatThunks';

const initialState: ChatState = {
  conversations: [],
  listFilter: 'all',
  listSearch: '',
  listPage: 1,
  hasMoreChats: false,
  isLoadingMore: false,
  tabCounts: null,
  threads: {},
  sendingId: null,
  selectedId: null,
  hasLoaded: false,
  isLoading: false,
  loadError: null,
  updatingStatusId: null,
  updatingAssignmentId: null,
  actionError: null,
};

// Ticks only move forward (a late "sent" never replaces "read"); failed always wins
const STATUS_RANK: Record<DeliveryStatus, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

// Most recent activity first
function sortByActivity(conversations: ChatConversation[]) {
  conversations.sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || b.id - a.id);
}

function findConversation(state: ChatState, conversationId: number) {
  return state.conversations.find((c) => c.id === conversationId);
}

// Insert or replace one chat (REST response or live event), keeping unread count and loaded messages
function upsert(state: ChatState, conversation: ApiConversation) {
  const index = state.conversations.findIndex((c) => c.id === conversation.id);
  const existing = index >= 0 ? state.conversations[index] : undefined;
  const updated = mapConversation(conversation, existing);

  // A new customer message in a chat that isn't open counts as unread
  const newLast = conversation.last_message;
  if (newLast && newLast.sender === 'user' && newLast.id !== existing?.lastMessage?.id && conversation.id !== state.selectedId) {
    updated.unread = (existing?.unread ?? 0) + 1;
  }

  if (index >= 0) state.conversations[index] = updated;
  else state.conversations.push(updated);
  sortByActivity(state.conversations);
}

// Add messages to an open chat by id: REST pages and live events can arrive in any order, and twice
function mergeMessages(state: ChatState, conversationId: number, incoming: ApiChatMessage[]) {
  const conversation = findConversation(state, conversationId);
  if (!conversation || !state.threads[conversationId]) return; // Not opened yet: loads fresh when it is

  const byId = new Map<number, ChatMessage>(conversation.messages.map((m) => [m.id, m]));
  for (const message of incoming) {
    const mapped = mapMessage(message);
    const current = byId.get(message.id);
    // Keep the further-along tick if an older copy arrives after a newer one
    if (current?.status && mapped.status && STATUS_RANK[current.status] > STATUS_RANK[mapped.status]) {
      mapped.status = current.status;
      mapped.read = current.read;
      mapped.error = current.error;
    }
    byId.set(message.id, mapped);
  }
  conversation.messages = [...byId.values()].sort((a, b) => a.id - b.id);
}

function applyStatus(message: ChatMessage | null | undefined, status: DeliveryStatus | null, error: string | null) {
  if (!message || !status) return;
  if (message.status && STATUS_RANK[message.status] >= STATUS_RANK[status]) return;
  message.status = status;
  message.read = status === 'read';
  message.error = status === 'failed' ? error : null;
}

function applyAttachment(message: ChatMessage | null | undefined, attachment: ApiAttachment) {
  if (message) message.attachment = mapAttachment(attachment);
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // conversation.updated / conversation.handover events
    conversationReceived: (state, action: PayloadAction<ApiConversation>) => {
      upsert(state, action.payload);
    },
    // message.new event (the chat list row comes separately as conversation.updated)
    messageReceived: (state, action: PayloadAction<ApiChatMessage>) => {
      mergeMessages(state, action.payload.conversation_id, [action.payload]);
    },
    // message.status event: tick in the open chat and in the list preview
    messageStatusReceived: (state, action: PayloadAction<RealtimeEventMap['message.status']>) => {
      const { id, conversation_id, status, error } = action.payload;
      const conversation = findConversation(state, conversation_id);
      if (!conversation) return;
      applyStatus(conversation.messages.find((m) => m.id === id), status, error);
      if (conversation.lastMessage?.id === id) applyStatus(conversation.lastMessage, status, error);
    },
    // attachment.updated event: download / parse finished
    attachmentReceived: (state, action: PayloadAction<RealtimeEventMap['attachment.updated']>) => {
      const { message_id, conversation_id, attachment } = action.payload;
      const conversation = findConversation(state, conversation_id);
      if (!conversation) return;
      applyAttachment(conversation.messages.find((m) => m.id === message_id), attachment);
      if (conversation.lastMessage?.id === message_id) applyAttachment(conversation.lastMessage, attachment);
    },
    // ticket.updated event: the chat's ticket chip / hint follow the ticket
    ticketChanged: (state, action: PayloadAction<Ticket>) => {
      const conversation = findConversation(state, action.payload.conversation_id);
      if (!conversation) return;
      const { id, number, status } = action.payload;
      conversation.openTicket = status === 'closed' ? (conversation.openTicket?.id === id ? null : conversation.openTicket) : { id, number, status };
    },
    // Tab or search changed: the page loads a fresh first page for it
    setChatListQuery: (state, action: PayloadAction<{ filter?: ChatFilterTab; search?: string }>) => {
      if (action.payload.filter !== undefined) state.listFilter = action.payload.filter;
      if (action.payload.search !== undefined) state.listSearch = action.payload.search;
    },
    selectConversation: (state, action: PayloadAction<number | null>) => {
      state.selectedId = action.payload;
      const conversation = state.conversations.find((c) => c.id === action.payload);
      if (conversation) conversation.unread = 0;
    },
    // conversation.read event: this user opened the chat in another tab
    conversationReadElsewhere: (state, action: PayloadAction<RealtimeEventMap['conversation.read']>) => {
      const conversation = findConversation(state, action.payload.conversation_id);
      if (conversation) conversation.unread = 0;
    },
    clearChatActionError: (state) => {
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state, action) => {
        if ((action.meta.arg?.page ?? 1) > 1) state.isLoadingMore = true;
        else state.isLoading = true;
        state.loadError = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isLoadingMore = false;
        // An answer for a tab / search the agent has already left: ignore it
        if (action.payload.query !== `${state.listFilter}|${state.listSearch.trim()}`) return;
        state.hasLoaded = true;
        const { conversations, page, total_pages } = action.payload;
        const previous = new Map(state.conversations.map((c) => [c.id, c]));
        const incoming = conversations.map((c) => mapConversation(c, previous.get(c.id)));
        // Unread counts come from the server; the chat being looked at is read
        incoming.forEach((c) => {
          if (c.id === state.selectedId) c.unread = 0;
        });

        if (page === 1) {
          // Fresh first page; keep loaded messages, and keep the open chat even if it isn't on it
          const open = state.conversations.find((c) => c.id === state.selectedId);
          state.conversations = open && !incoming.some((c) => c.id === open.id) ? [...incoming, open] : incoming;
        } else {
          // Next page: add what's new (a chat can move between pages while scrolling)
          const byId = new Map(state.conversations.map((c) => [c.id, c]));
          incoming.forEach((c) => byId.set(c.id, c));
          state.conversations = [...byId.values()];
        }
        sortByActivity(state.conversations);
        state.listPage = page;
        state.hasMoreChats = page < total_pages;
      })
      .addCase(fetchConversationCounts.fulfilled, (state, action) => {
        state.tabCounts = action.payload;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.isLoading = false;
        state.isLoadingMore = false;
        state.loadError = action.payload as string;
      })

      // Messages: the thread exists from the first request, so live events during the load aren't dropped
      .addCase(fetchMessages.pending, (state, action) => {
        const { conversationId } = action.meta.arg;
        const thread = state.threads[conversationId] ?? { hasMore: false, nextBeforeId: null };
        state.threads[conversationId] = { ...thread, isLoading: true, loadError: null };
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { conversationId, beforeId } = action.meta.arg;
        const thread = state.threads[conversationId];
        mergeMessages(state, conversationId, action.payload.messages);
        thread.isLoading = false;
        // Only an older page moves the cursor back; a refresh of the newest page keeps the scroll-back position
        if (beforeId || thread.nextBeforeId === null) {
          thread.hasMore = action.payload.has_more;
          thread.nextBeforeId = action.payload.next_before_id;
        }
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        const thread = state.threads[action.meta.arg.conversationId];
        thread.isLoading = false;
        thread.loadError = action.payload as string;
      })

      .addCase(updateConversationStatus.pending, (state, action) => {
        state.updatingStatusId = action.meta.arg.conversationId;
        state.actionError = null;
      })
      .addCase(updateConversationStatus.fulfilled, (state, action) => {
        state.updatingStatusId = null;
        upsert(state, action.payload);
      })
      .addCase(updateConversationStatus.rejected, (state, action) => {
        state.updatingStatusId = null;
        state.actionError = action.payload as string;
      })

      .addCase(assignConversation.pending, (state, action) => {
        state.updatingAssignmentId = action.meta.arg.conversationId;
        state.actionError = null;
      })
      .addCase(assignConversation.fulfilled, (state, action) => {
        state.updatingAssignmentId = null;
        upsert(state, action.payload);
      })
      .addCase(assignConversation.rejected, (state, action) => {
        state.updatingAssignmentId = null;
        state.actionError = action.payload as string;
      })

      // Text, file and template replies: same sending state, merge and takeover
      .addMatcher(
        (action) => [sendAgentMessage.pending.type, sendAgentAttachment.pending.type, sendAgentTemplate.pending.type].includes(action.type),
        (state, action: PayloadAction<unknown, string, { arg: { conversationId: number } }>) => {
          state.sendingId = action.meta.arg.conversationId;
          state.actionError = null;
        }
      )
      .addMatcher(
        (action) => [sendAgentMessage.fulfilled.type, sendAgentAttachment.fulfilled.type, sendAgentTemplate.fulfilled.type].includes(action.type),
        (
          state,
          action: PayloadAction<{ messages: ApiChatMessage[]; conversation_status: ConversationStatus; assigned_to: ChatConversation['assignedTo'] }, string, { arg: { conversationId: number } }>
        ) => {
          const { conversationId } = action.meta.arg;
          state.sendingId = null;
          mergeMessages(state, conversationId, action.payload.messages);
          // Replying takes the chat over from the AI (and makes you the owner if nobody was)
          const conversation = findConversation(state, conversationId);
          if (conversation) {
            conversation.status = action.payload.conversation_status;
            conversation.assignedTo = action.payload.assigned_to;
          }
        }
      )
      .addMatcher(
        (action) => [sendAgentMessage.rejected.type, sendAgentAttachment.rejected.type, sendAgentTemplate.rejected.type].includes(action.type),
        (state, action: PayloadAction<unknown>) => {
          state.sendingId = null;
          state.actionError = action.payload as string;
        }
      )
      // Logged out: never show one user's chats to the next one
      .addMatcher((action) => action.type === 'workspace/logoutWorkspace', () => initialState);
  },
});

export const {
  conversationReceived,
  messageReceived,
  messageStatusReceived,
  attachmentReceived,
  ticketChanged,
  setChatListQuery,
  selectConversation,
  conversationReadElsewhere,
  clearChatActionError,
} = chatSlice.actions;
export default chatSlice.reducer;
