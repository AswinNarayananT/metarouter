import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import type { ChatConversation, ChatFocus, ChatThread } from '@/types/chatTypes';
import { MessageBubble } from './MessageBubble';

const NEAR_BOTTOM_PX = 120; // Within this of the bottom, new messages scroll into view
const HIGHLIGHT_MS = 4000; // How long the jumped-to message stays highlighted

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
  focus = null,
  onFocused,
}: {
  conversation: ChatConversation;
  thread: ChatThread | undefined;
  selectedDocumentId: number | null;
  onOpenDocument: (messageId: number) => void;
  onLoadOlder: () => void;
  focus?: ChatFocus | null; // Jump here (a ticket's first message) once its page is loaded
  onFocused?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messages = conversation.messages;
  const firstId = messages[0]?.id;
  const lastId = messages[messages.length - 1]?.id;

  // What the list looked like before this render, to decide how to scroll after it.
  // Starts with no chat, so the first render (also one with messages already loaded) starts at the newest message
  const previous = useRef<{ conversationId: number | null; firstId?: number; lastId?: number; scrollHeight: number; nearBottom: boolean }>({
    conversationId: null,
    firstId: undefined,
    lastId: undefined,
    scrollHeight: 0,
    nearBottom: true,
  });
  // The jumped-to message: highlighted for a moment, with a "Ticket #3 starts here" line above it
  const [marker, setMarker] = useState<{ messageId: number; label: string; highlight: boolean } | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

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

  // Jump to the focus message (or the first one after it, e.g. when that one was an activity line) once it's loaded
  const focusMessageId = focus?.messageId ?? null;
  const focusLabel = focus?.label ?? '';
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || focusMessageId === null || messages.length === 0) return;
    const target = messages.find((m) => m.id >= focusMessageId) ?? messages[messages.length - 1];
    const node = el.querySelector<HTMLElement>(`[data-message-id="${target.id}"]`);
    if (!node) return;
    el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top - 48; // A little room above it for the "starts here" line
    previous.current.nearBottom = false;
    previous.current.scrollHeight = el.scrollHeight;
    setMarker({ messageId: target.id, label: focusLabel, highlight: true });
    setShowJumpToLatest(true);
    onFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMessageId, messages.length]);

  // The highlight fades after a moment; the "starts here" line stays while the chat is open
  useEffect(() => {
    if (!marker?.highlight) return;
    const timer = window.setTimeout(() => setMarker((m) => (m ? { ...m, highlight: false } : m)), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [marker?.highlight]);

  // Pictures and files that finish loading make the chat taller: stay at the newest message if the agent was there
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (previous.current.nearBottom) el.scrollTop = el.scrollHeight;
      previous.current.scrollHeight = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [conversation.id]);

  // Remember whether the agent is at the bottom (scrolled up to read history = don't jump)
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    previous.current.nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    previous.current.scrollHeight = el.scrollHeight;
    if (previous.current.nearBottom && showJumpToLatest) setShowJumpToLatest(false);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    previous.current.nearBottom = true;
    setShowJumpToLatest(false);
  };

  // A different chat: no marker from the previous one
  const [markerChat, setMarkerChat] = useState(conversation.id);
  if (markerChat !== conversation.id) {
    setMarkerChat(conversation.id);
    setMarker(null);
    setShowJumpToLatest(false);
  }

  // Older messages load by themselves when the top of the chat scrolls into view (the button stays as a fallback)
  const topRef = useRef<HTMLDivElement>(null);
  const loadOlderRef = useRef(onLoadOlder);
  useEffect(() => {
    loadOlderRef.current = onLoadOlder;
  });
  const canLoadOlder = Boolean(thread?.hasMore && !thread.isLoading);
  useEffect(() => {
    const top = topRef.current;
    if (!top || !canLoadOlder) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadOlderRef.current(), {
      root: scrollRef.current,
      rootMargin: '150px',
    });
    observer.observe(top);
    return () => observer.disconnect();
  }, [canLoadOlder, firstId]);

  const isFirstLoad = thread?.isLoading && messages.length === 0;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 sm:px-8 py-4 bg-chat-bg">
      <div ref={contentRef} className="max-w-3xl mx-auto space-y-2">
        {thread?.hasMore && (
          <div ref={topRef} className="flex justify-center">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={thread.isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest shadow-subtle text-xs font-medium text-on-surface-variant hover:text-on-surface disabled:opacity-60 cursor-pointer"
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
                  <span className="px-3 py-1 rounded-bubble bg-surface-container-lowest shadow-subtle text-xs font-medium text-on-surface-variant">
                    {day}
                  </span>
                </div>
              )}
              {marker?.messageId === m.id && marker.label && (
                <div className="flex items-center gap-2 text-[11px] font-semibold text-primary-strong">
                  <span className="flex-1 h-px bg-primary/30" />
                  {marker.label} starts here
                  <span className="flex-1 h-px bg-primary/30" />
                </div>
              )}
              <div
                data-message-id={m.id}
                className={`rounded-bubble transition-shadow duration-700 ${marker?.messageId === m.id && marker.highlight ? 'ring-2 ring-primary/60 ring-offset-4 ring-offset-chat-bg' : ''}`}
              >
                <MessageBubble
                  message={m}
                  documentSelected={selectedDocumentId === m.id}
                  onOpenDocument={() => onOpenDocument(m.id)}
                />
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
    {/* After a jump into older messages: one tap back to the newest */}
    {showJumpToLatest && (
      <button
        type="button"
        onClick={jumpToLatest}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium shadow-elevated hover:bg-primary-container cursor-pointer"
      >
        <ArrowDown className="w-3.5 h-3.5" /> Jump to latest
      </button>
    )}
    </div>
  );
}
