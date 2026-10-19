import { Fragment, useLayoutEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { ChatConversation, ChatThread } from '@/types/chatTypes';
import { MessageBubble } from './MessageBubble';

const NEAR_BOTTOM_PX = 120; // Within this of the bottom, new messages scroll into view

// "Today", "Yesterday" or "12 Oct 2026"
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Scrollable message history: day separators, "load older" at the top, follows new messages at the bottom. */
export function MessageList({
  conversation,
  thread,
  selectedDocumentId,
  onOpenDocument,
  onLoadOlder,
}: {
  conversation: ChatConversation;
  thread: ChatThread | undefined;
  selectedDocumentId: number | null;
  onOpenDocument: (messageId: number) => void;
  onLoadOlder: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = conversation.messages;
  const firstId = messages[0]?.id;
  const lastId = messages[messages.length - 1]?.id;

  // What the list looked like before this render, to decide how to scroll after it
  const previous = useRef({ conversationId: conversation.id, firstId, lastId, scrollHeight: 0, nearBottom: true });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const before = previous.current;

    if (before.conversationId !== conversation.id || before.lastId === undefined) {
      // Opened a chat / first page arrived: start at the newest message
      el.scrollTop = el.scrollHeight;
    } else if (firstId !== before.firstId && lastId === before.lastId) {
      // Older messages added on top: keep the message the agent was reading in place
      el.scrollTop += el.scrollHeight - before.scrollHeight;
    } else if (lastId !== before.lastId && before.nearBottom) {
      // New message at the bottom while following the chat
      el.scrollTop = el.scrollHeight;
    }

    previous.current = {
      conversationId: conversation.id,
      firstId,
      lastId,
      scrollHeight: el.scrollHeight,
      nearBottom: el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX,
    };
  }, [conversation.id, firstId, lastId, messages.length]);

  // Remember whether the agent is at the bottom (scrolled up to read history = don't jump)
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    previous.current.nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    previous.current.scrollHeight = el.scrollHeight;
  };

  const isFirstLoad = thread?.isLoading && messages.length === 0;

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 bg-surface-container-lowest">
      <div className="max-w-3xl mx-auto space-y-3">
        {thread?.hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={thread.isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant/40 text-xs font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-60 cursor-pointer"
            >
              {thread.isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              Load older messages
            </button>
          </div>
        )}

        {isFirstLoad && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading messages…
          </p>
        )}
        {thread?.loadError && <p className="py-4 text-center text-sm text-error">{thread.loadError}</p>}
        {!thread?.isLoading && !thread?.loadError && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-on-surface-variant">No messages yet.</p>
        )}

        {messages.map((m, index) => {
          const day = dayLabel(m.createdAt);
          const showDay = index === 0 || dayLabel(messages[index - 1].createdAt) !== day;
          return (
            <Fragment key={m.id}>
              {showDay && (
                <div className="flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-surface-container text-[11px] font-medium text-on-surface-variant">
                    {day}
                  </span>
                </div>
              )}
              <MessageBubble
                message={m}
                documentSelected={selectedDocumentId === m.id}
                onOpenDocument={() => onOpenDocument(m.id)}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
