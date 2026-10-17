import { useCallback, useMemo, useState } from 'react';
import type { ChatConversation, ChatFilterTab, ChatSidePanel } from '@/types/chatTypes';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { Composer } from '@/components/chat/Composer';
import { ContactPanel } from '@/components/chat/ContactPanel';
import { ConversationList } from '@/components/chat/ConversationList';
import { DocumentPanel } from '@/components/chat/DocumentPanel';
import { DocumentViewer } from '@/components/chat/DocumentViewer';
import { EmptyChatState } from '@/components/chat/EmptyChatState';
import { MessageList } from '@/components/chat/MessageList';
import { TakeoverBanner } from '@/components/chat/TakeoverBanner';
import { SAMPLE_CONVERSATIONS } from './chatSampleData';

export function CustomerChats() {
  const [conversations, setConversations] = useState<ChatConversation[]>(SAMPLE_CONVERSATIONS);
  const [selectedId, setSelectedId] = useState<number | null>(SAMPLE_CONVERSATIONS[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatFilterTab>('all');
  const [draft, setDraft] = useState('');
  const [panel, setPanel] = useState<ChatSidePanel>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // On small screens show either the list or the open chat
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const documentMessage =
    panel?.type === 'document' ? selected?.messages.find((m) => m.id === panel.messageId) : undefined;
  const openDocument = documentMessage?.attachment;
  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'ai' && c.status !== 'active') return false;
      if (filter === 'human' && c.status !== 'human_takeover') return false;
      if (!q) return true;
      const last = c.messages[c.messages.length - 1]?.content ?? '';
      return c.name.toLowerCase().includes(q) || c.phone.includes(q) || last.toLowerCase().includes(q);
    });
  }, [conversations, query, filter]);

  const counts = useMemo(
    () => ({
      all: conversations.length,
      ai: conversations.filter((c) => c.status === 'active').length,
      human: conversations.filter((c) => c.status === 'human_takeover').length,
    }),
    [conversations]
  );

  const openConversation = (id: number) => {
    setSelectedId(id);
    setMobileView('chat');
    setDraft('');
    // Documents belong to a conversation — don't carry one over to another chat
    setPanel((p) => (p?.type === 'document' ? null : p));
    setViewerOpen(false);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const toggleTakeover = () => {
    if (!selected) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? { ...c, status: c.status === 'human_takeover' ? 'active' : 'human_takeover' }
          : c
      )
    );
  };

  // UI-only: appends the reply locally until the send API is wired up
  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !selected) return;
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? {
              ...c,
              status: 'human_takeover',
              lastActive: time,
              messages: [...c.messages, { id: Date.now(), sender: 'human', content: text, time }],
            }
          : c
      )
    );
    setDraft('');
  };

  const showDocument = (messageId: number) => setPanel({ type: 'document', messageId });

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
            />
            {selected.status === 'human_takeover' && <TakeoverBanner />}
            <MessageList
              conversation={selected}
              selectedDocumentId={panel?.type === 'document' ? panel.messageId : null}
              onOpenDocument={showDocument}
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
