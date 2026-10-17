import { useEffect, useRef } from 'react';
import type { ChatConversation } from '@/types/chatTypes';
import { MessageBubble } from './MessageBubble';

/** Scrollable message history; keeps the newest message in view. */
export function MessageList({
  conversation,
  selectedDocumentId,
  onOpenDocument,
}: {
  conversation: ChatConversation;
  selectedDocumentId: number | null;
  onOpenDocument: (messageId: number) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation.id, conversation.messages.length]);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 bg-surface-container-lowest">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex justify-center">
          <span className="px-3 py-1 rounded-full bg-surface-container text-[11px] font-medium text-on-surface-variant">
            Today
          </span>
        </div>

        {conversation.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            documentSelected={selectedDocumentId === m.id}
            onOpenDocument={() => onOpenDocument(m.id)}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
