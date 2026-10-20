import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatFilterTab, ChatSidePanel } from '@/types/chatTypes';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearChatActionError, selectConversation } from '@/store/chat/chatSlice';
import { assignConversation, fetchConversations, fetchMessages, sendAgentMessage, updateConversationStatus } from '@/store/chat/chatThunks';
import { fetchTeamMembers } from '@/store/workspace/workspaceThunks';
import { markNotificationsRead } from '@/store/notifications/notificationThunks';
import { useOpenChatRealtimeSync } from '@/hooks/useChatRealtime';
import { AssignMenu } from '@/components/chat/AssignMenu';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { Composer } from '@/components/chat/Composer';
import { ContactPanel } from '@/components/chat/ContactPanel';
import { ConversationList } from '@/components/chat/ConversationList';
import { DocumentPanel } from '@/components/chat/DocumentPanel';
import { DocumentViewer } from '@/components/chat/DocumentViewer';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { MessageList } from '@/components/chat/MessageList';
import { TakeoverBanner } from '@/components/chat/TakeoverBanner';

export function CustomerChats() {
  const dispatch = useAppDispatch();
  const { conversations, threads, selectedId, isLoading, loadError, hasLoaded, sendingId, actionError, updatingAssignmentId } = useAppSelector((state) => state.chat);
  const currentUser = useAppSelector((state) => state.workspace.user);
  const teamMembers = useAppSelector((state) => state.workspace.teamMembers);
  const notifications = useAppSelector((state) => state.notifications.items);
  const currentUserId = currentUser?.id ?? null;
  // Admins and managers supervise: they assign anyone and can reply to any chat
  const isSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatFilterTab>('all');
  const [draft, setDraft] = useState('');
  const [panel, setPanel] = useState<ChatSidePanel>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // On small screens show either the list or the open chat (a handover alert arrives with a chat selected)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(() => (selectedId ? 'chat' : 'list'));

  // 1. Load the chats (live events keep the list current afterwards) and the members to assign them to
  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);
  useEffect(() => {
    if (isSupervisor && teamMembers.length === 0) dispatch(fetchTeamMembers());
  }, [dispatch, isSupervisor, teamMembers.length]);

  // Leaving the page: no chat is open, so new customer messages count as unread again
  useEffect(() => () => {
    dispatch(selectConversation(null));
  }, [dispatch]);

  // 2. Open chat: load its newest messages (every time, since events stop while it's closed) and follow it live
  useEffect(() => {
    if (selectedId !== null) dispatch(fetchMessages({ conversationId: selectedId }));
  }, [dispatch, selectedId]);
  useOpenChatRealtimeSync(selectedId);

  // Looking at the chat = its notifications are dealt with (also ones that arrive while it's open)
  const hasUnreadForChat = selectedId !== null && notifications.some((n) => n.conversation_id === selectedId && !n.read_at);
  useEffect(() => {
    if (selectedId !== null && hasUnreadForChat) dispatch(markNotificationsRead({ conversationId: selectedId }));
  }, [dispatch, selectedId, hasUnreadForChat]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const thread = selectedId !== null ? threads[selectedId] : undefined;
  const documentMessage =
    panel?.type === 'document' ? selected?.messages.find((m) => m.id === panel.messageId) : undefined;
  const openDocument = documentMessage?.attachment;
  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'ai' && c.status !== 'active') return false;
      if (filter === 'mine' && c.assignedTo?.id !== currentUserId) return false;
      if (filter === 'unassigned' && (c.status !== 'human_takeover' || c.assignedTo)) return false;
      if (!q) return true;
      const last = c.lastMessage?.content ?? '';
      return c.name.toLowerCase().includes(q) || c.phone.includes(q) || last.toLowerCase().includes(q);
    });
  }, [conversations, query, filter, currentUserId]);

  const counts = useMemo(
    () => ({
      all: conversations.length,
      mine: conversations.filter((c) => c.assignedTo?.id === currentUserId).length,
      unassigned: conversations.filter((c) => c.status === 'human_takeover' && !c.assignedTo).length,
      ai: conversations.filter((c) => c.status === 'active').length,
    }),
    [conversations, currentUserId]
  );

  const openConversation = (id: number) => {
    dispatch(selectConversation(id));
    dispatch(clearChatActionError());
    setMobileView('chat');
    setDraft('');
    // Documents belong to a conversation — don't carry one over to another chat
    setPanel((p) => (p?.type === 'document' ? null : p));
    setViewerOpen(false);
  };

  const toggleTakeover = () => {
    if (!selected) return;
    dispatch(
      updateConversationStatus({
        conversationId: selected.id,
        status: selected.status === 'human_takeover' ? 'active' : 'human_takeover',
      })
    );
  };

  const loadOlder = () => {
    if (selected && thread?.nextBeforeId) dispatch(fetchMessages({ conversationId: selected.id, beforeId: thread.nextBeforeId }));
  };

  // 3. Agent reply: the draft is cleared only once the API accepted it (kept on errors to retry)
  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !selected) return;
    dispatch(sendAgentMessage({ conversationId: selected.id, content: text }))
      .unwrap()
      .then(() => setDraft(''))
      .catch(() => {});
  };

  const assign = (userId: number | null) => {
    if (selected) dispatch(assignConversation({ conversationId: selected.id, userId }));
  };

  // WhatsApp allows free text only within 24 hours of the customer's last message
  const windowClosed = selected ? !selected.windowOpen : false;
  // Someone else owns the chat: only they (or a supervisor) can reply
  const ownedByOther = Boolean(selected?.assignedTo && selected.assignedTo.id !== currentUserId && !isSupervisor);

  const showDocument = (messageId: number) => setPanel({ type: 'document', messageId });

  const emptyMessage = isLoading && !hasLoaded ? 'Loading conversations…' : loadError ?? 'No conversations found.';

  return (
    // Cancel <main>'s padding and fill the viewport below the 64px navbar
    <div className="-m-4 sm:-m-6 lg:-m-8 h-[calc(100dvh-4rem)] flex overflow-hidden bg-surface">
      <ConversationList
        className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex`}
        conversations={filtered}
        counts={counts}
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        selectedId={selectedId}
        onSelect={openConversation}
        emptyMessage={emptyMessage}
      />

      <section
        className={`${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col`}
        aria-label="Conversation"
      >
        {selected ? (
          <>
            <ChatHeader
              conversation={selected}
              contactOpen={panel?.type === 'contact'}
              onBack={() => setMobileView('list')}
              onToggleTakeover={toggleTakeover}
              onToggleContact={() => setPanel((p) => (p?.type === 'contact' ? null : { type: 'contact' }))}
              assignControl={
                <AssignMenu
                  conversation={selected}
                  members={teamMembers}
                  currentUserId={currentUserId}
                  isSupervisor={isSupervisor}
                  busy={updatingAssignmentId === selected.id}
                  onAssign={assign}
                />
              }
            />
            {selected.status === 'human_takeover' && <TakeoverBanner />}
            <MessageList
              conversation={selected}
              thread={thread}
              selectedDocumentId={panel?.type === 'document' ? panel.messageId : null}
              onOpenDocument={showDocument}
              onLoadOlder={loadOlder}
            />
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={sendMessage}
              placeholder={
                selected.status === 'human_takeover'
                  ? 'Type a reply...'
                  : 'Type a reply — sending will take over from the AI'
              }
              disabledReason={
                ownedByOther
                  ? `${selected.assignedTo?.name} is handling this chat. Ask them or a manager to reassign it to you.`
                  : windowClosed
                  ? "It's been over 24 hours since the customer's last message. WhatsApp only allows a template now, so replying here opens again when they write back."
                  : null
              }
              sending={sendingId === selected.id}
              error={actionError}
            />
          </>
        ) : (
          <EmptyChatState />
        )}
      </section>

      {/* Right sidebar: document details or contact details */}
      {selected && openDocument && documentMessage && (
        <DocumentPanel
          attachment={openDocument}
          sentAt={documentMessage.time}
          onClose={() => setPanel(null)}
          onViewFull={() => setViewerOpen(true)}
        />
      )}
      {selected && panel?.type === 'contact' && (
        <ContactPanel conversation={selected} onClose={() => setPanel(null)} onOpenDocument={showDocument} />
      )}

      {viewerOpen && openDocument && <DocumentViewer attachment={openDocument} onClose={closeViewer} />}
    </div>
  );
}
