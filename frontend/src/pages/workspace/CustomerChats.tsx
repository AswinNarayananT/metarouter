import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatSidePanel } from '@/types/chatTypes';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearChatActionError, selectConversation, setChatListQuery } from '@/store/chat/chatSlice';
import { assignConversation, fetchConversationCounts, fetchConversations, fetchMessages, markConversationRead, sendAgentAttachment, sendAgentMessage, sendAgentTemplate, updateConversationStatus } from '@/store/chat/chatThunks';
import { TemplateDialog } from '@/components/chat/TemplateDialog';
import type { BroadcastTemplate } from '@/types/broadcastTypes';
import { fetchTeamMembers } from '@/store/workspace/workspaceThunks';
import { markNotificationsRead } from '@/store/notifications/notificationThunks';
import { useOpenChatRealtimeSync } from '@/hooks/useChatRealtime';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { useReplyWindowOpen } from '@/hooks/useReplyWindow';
import { AssignMenu } from '@/components/chat/AssignMenu';
import { TicketChip } from '@/components/chat/TicketChip';
import { TicketHint } from '@/components/chat/TicketHint';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { closeTicket } from '@/store/tickets/ticketThunks';
import { fetchQuickReplies } from '@/store/quickReplies/quickRepliesThunks';
import { fillPlaceholders } from '@/utils/quickReplies';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { Composer } from '@/components/chat/Composer';
import { ContactPanel } from '@/components/chat/ContactPanel';
import { ConversationList } from '@/components/chat/ConversationList';
import { DocumentPanel } from '@/components/chat/DocumentPanel';
import { DocumentViewer } from '@/components/chat/DocumentViewer';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { MessageList } from '@/components/chat/MessageList';
import { TakeoverBanner } from '@/components/chat/TakeoverBanner';
import { WindowNoticeBanner } from '@/components/chat/WindowNoticeBanner';

const SEARCH_DEBOUNCE_MS = 300;
const COUNTS_REFRESH_MS = 1500;

export function CustomerChats() {
  const dispatch = useAppDispatch();
  // Failed sends / assigns / takeovers show as toasts (store/errorToastMiddleware), so actionError isn't read here
  const { conversations, threads, selectedId, isLoading, loadError, hasLoaded, sendingId, updatingAssignmentId, listFilter, listSearch, listPage, hasMoreChats, isLoadingMore, tabCounts } = useAppSelector(
    (state) => state.chat
  );
  const currentUser = useAppSelector((state) => state.workspace.user);
  const teamMembers = useAppSelector((state) => state.workspace.teamMembers);
  const notifications = useAppSelector((state) => state.notifications.items);
  const quickReplies = useAppSelector((state) => state.quickReplies.items);
  const currentUserId = currentUser?.id ?? null;
  // Admins and managers supervise: they assign anyone and can reply to any chat
  const isSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [searchText, setSearchText] = useState(listSearch); // Typed text; sent to the server after a pause
  const [draft, setDraft] = useState('');
  const [panel, setPanel] = useState<ChatSidePanel>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null); // File waiting to be sent (the draft is its caption)
  const [templateOpen, setTemplateOpen] = useState(false);
  const savingTicketId = useAppSelector((state) => state.tickets.savingId);
  const updatingStatusId = useAppSelector((state) => state.chat.updatingStatusId);
  // On small screens show either the list or the open chat (a handover alert arrives with a chat selected)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(() => (selectedId ? 'chat' : 'list'));

  // 1. First page of chats for the current tab + search (more load as the agent scrolls), the tab counts,
  //    and the members to assign chats to
  useEffect(() => {
    dispatch(fetchConversations({ page: 1 }));
  }, [dispatch, listFilter, listSearch]);
  useEffect(() => {
    dispatch(fetchConversationCounts());
    dispatch(fetchQuickReplies()); // Saved replies for the reply box ("/" or the ⚡ button)
  }, [dispatch]);

  // Search on the server once the agent stops typing (it covers every chat, not just the loaded ones)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText.trim() !== listSearch) dispatch(setChatListQuery({ search: searchText.trim() }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, searchText, listSearch]);

  // Tab counts change as chats are assigned / handed over: refresh them shortly after a change
  const countsTimer = useRef<number | null>(null);
  useRealtimeEvent('conversation.updated', () => {
    if (countsTimer.current !== null) window.clearTimeout(countsTimer.current);
    countsTimer.current = window.setTimeout(() => dispatch(fetchConversationCounts()), COUNTS_REFRESH_MS);
  });
  useEffect(() => () => {
    if (countsTimer.current !== null) window.clearTimeout(countsTimer.current);
  }, []);
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

  // Looking at the chat = read: save this user's marker on opening it and when new messages arrive while it's open
  const selectedLastMessageId = selected?.lastMessage?.id ?? null;
  useEffect(() => {
    if (selectedId !== null) dispatch(markConversationRead(selectedId));
  }, [dispatch, selectedId, selectedLastMessageId]);
  const thread = selectedId !== null ? threads[selectedId] : undefined;
  const documentMessage =
    panel?.type === 'document' ? selected?.messages.find((m) => m.id === panel.messageId) : undefined;
  const openDocument = documentMessage?.attachment;
  const closeViewer = useCallback(() => setViewerOpen(false), []);

  // The server already filtered by tab + search; this keeps live updates consistent with them
  // (e.g. a chat that just got assigned leaves the Unassigned tab without a reload)
  const filtered = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return conversations.filter((c) => {
      if (listFilter === 'ai' && c.status !== 'active') return false;
      if (listFilter === 'mine' && c.assignedTo?.id !== currentUserId) return false;
      if (listFilter === 'unassigned' && (c.status !== 'human_takeover' || c.assignedTo)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.phone.replace('+', '').includes(q.replace('+', ''));
    });
  }, [conversations, listSearch, listFilter, currentUserId]);

  const counts = tabCounts ?? { all: 0, mine: 0, unassigned: 0, ai: 0 };
  const loadMoreChats = () => {
    if (hasMoreChats && !isLoadingMore && !isLoading) dispatch(fetchConversations({ page: listPage + 1 }));
  };

  const openConversation = (id: number) => {
    dispatch(selectConversation(id));
    dispatch(clearChatActionError());
    setMobileView('chat');
    setDraft('');
    setPendingFile(null);
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

  // 3. Agent reply (text, or a file with the text as its caption): cleared only once the API accepted it
  const sendMessage = () => {
    const text = draft.trim();
    if (!selected || (!text && !pendingFile)) return;
    const request = pendingFile
      ? dispatch(sendAgentAttachment({ conversationId: selected.id, file: pendingFile, caption: text }))
      : dispatch(sendAgentMessage({ conversationId: selected.id, content: text }));
    request
      .unwrap()
      .then(() => {
        setDraft('');
        setPendingFile(null);
      })
      .catch(() => {});
  };

  // Approved template: works outside the 24-hour window
  const sendTemplate = (template: BroadcastTemplate, parameters: string[]) => {
    if (!selected) return;
    dispatch(sendAgentTemplate({ conversationId: selected.id, templateName: template.name, language: template.language, parameters }))
      .unwrap()
      .then(() => setTemplateOpen(false))
      .catch(() => {});
  };

  const assign = (userId: number | null) => {
    if (selected) dispatch(assignConversation({ conversationId: selected.id, userId }));
  };

  // WhatsApp allows free text only within 24 hours of the customer's last message (closes live, with the badge)
  const windowOpenNow = useReplyWindowOpen(selected?.windowOpen ?? false, selected?.windowExpiresAt ?? null);
  const windowClosed = selected ? !windowOpenNow : false;
  // After the agent replied in a chat with an open ticket: suggest handing back so the AI closes it
  const lastRealMessage = selected ? [...selected.messages].reverse().find((m) => m.sender !== 'system') : undefined;
  const canHandleChat = Boolean(selected && (selected.assignedTo?.id === currentUserId || isSupervisor));
  const showTicketHint = Boolean(selected?.openTicket && selected.status === 'human_takeover' && lastRealMessage?.sender === 'human' && canHandleChat);

  const handBack = () => {
    if (selected) dispatch(updateConversationStatus({ conversationId: selected.id, status: 'active' }));
  };

  const confirmCloseTicket = async (resolution: string, handBackToAi: boolean) => {
    if (!selected?.openTicket) return;
    const result = await dispatch(closeTicket({ ticketId: selected.openTicket.id, resolution, handBackToAi }));
    if (closeTicket.fulfilled.match(result)) setClosingTicket(false);
  };

  // Someone else owns the chat: only they (or a supervisor) can reply
  const ownedByOther = Boolean(selected?.assignedTo && selected.assignedTo.id !== currentUserId && !isSupervisor);
  // Same rule as the server's can_reply: the owner always can; otherwise the role must be allowed to handle chats
  // (AI settings "allowed roles for handover"). Controls this member can't use are hidden, not shown to fail
  const canHandleChats = currentUser?.can_handle_chats ?? true;
  const isMine = Boolean(selected?.assignedTo && selected.assignedTo.id === currentUserId);
  const roleCantPickUp = !isMine && !ownedByOther && !canHandleChats;
  const canActOnChat = !ownedByOther && !roleCantPickUp;

  const showDocument = (messageId: number) => setPanel({ type: 'document', messageId });

  const emptyMessage = isLoading && !hasLoaded ? 'Loading conversations…' : loadError ?? 'No conversations found.';

  return (
    // Cancel <main>'s padding and fill the viewport below the 64px navbar
    <div className="-m-4 sm:-m-6 lg:-m-8 h-[calc(100dvh-4rem)] flex overflow-hidden bg-surface">
      <ConversationList
        className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex`}
        conversations={filtered}
        counts={counts}
        query={searchText}
        onQueryChange={setSearchText}
        filter={listFilter}
        onFilterChange={(tab) => dispatch(setChatListQuery({ filter: tab }))}
        hasMore={hasMoreChats}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMoreChats}
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
              onToggleTakeover={canActOnChat ? toggleTakeover : undefined}
              onToggleContact={() => setPanel((p) => (p?.type === 'contact' ? null : { type: 'contact' }))}
              onOpenTemplates={
                !canActOnChat
                  ? undefined
                  : () => {
                      dispatch(clearChatActionError());
                      setTemplateOpen(true);
                    }
              }
              assignControl={
                <>
                {selected.openTicket && <TicketChip ticket={selected.openTicket} />}
                <AssignMenu
                  conversation={selected}
                  members={teamMembers}
                  currentUserId={currentUserId}
                  isSupervisor={isSupervisor}
                  canPickUp={canHandleChats}
                  busy={updatingAssignmentId === selected.id}
                  onAssign={assign}
                />
                </>
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
            {showTicketHint && selected.openTicket && (
              <TicketHint
                ticketNumber={selected.openTicket.number}
                busy={updatingStatusId === selected.id}
                onHandBack={handBack}
                onCloseTicket={() => setClosingTicket(true)}
              />
            )}
            <WindowNoticeBanner
              windowOpen={selected.windowOpen}
              windowExpiresAt={selected.windowExpiresAt}
              disabled={!canActOnChat}
              onOpenTemplates={() => {
                dispatch(clearChatActionError());
                setTemplateOpen(true);
              }}
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
                  : roleCantPickUp
                  ? "Your role can't pick up chats. Ask an admin or manager to assign this chat to you."
                  : windowClosed
                  ? "It's been over 24 hours since the customer's last message. WhatsApp only allows a template now, so replying here opens again when they write back."
                  : null
              }
              sending={sendingId === selected.id}
              file={pendingFile}
              onFileChange={(file) => {
                setPendingFile(file);
                dispatch(clearChatActionError());
              }}
              onOpenTemplates={
                !canActOnChat
                  ? undefined
                  : () => {
                      dispatch(clearChatActionError());
                      setTemplateOpen(true);
                    }
              }
              quickReplies={quickReplies}
              fillQuickReply={(content) =>
                fillPlaceholders(content, {
                  customerName: selected.hasName ? selected.name : null,
                  agentName: currentUser?.name,
                  businessName: currentUser?.organization_name,
                })
              }
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

      {templateOpen && selected && (
        <TemplateDialog
          conversationId={selected.id}
          customerName={selected.hasName ? selected.name : null}
          busy={sendingId === selected.id}
          onCancel={() => setTemplateOpen(false)}
          onSend={sendTemplate}
        />
      )}

      {closingTicket && selected?.openTicket && (
        <CloseTicketDialog
          ticketNumber={selected.openTicket.number}
          busy={savingTicketId === selected.openTicket.id}
          onCancel={() => setClosingTicket(false)}
          onConfirm={confirmCloseTicket}
        />
      )}
    </div>
  );
}
