import { Bot, Check, CheckCheck, UserRound } from 'lucide-react';
import type { ChatMessage } from '@/types/chatTypes';
import { AttachmentCard } from './AttachmentCard';

const BUBBLE_STYLES: Record<ChatMessage['sender'], string> = {
  user: 'bg-surface-container-low text-on-surface rounded-2xl rounded-tl-sm border border-outline-variant/30',
  model: 'bg-primary text-on-primary rounded-2xl rounded-tr-sm',
  human: 'bg-surface-container-high text-on-surface rounded-2xl rounded-tr-sm',
};

/** One message: customer messages on the left, AI / team replies on the right. */
export function MessageBubble({
  message,
  documentSelected,
  onOpenDocument,
}: {
  message: ChatMessage;
  documentSelected: boolean;
  onOpenDocument: () => void;
}) {
  const outgoing = message.sender !== 'user';

  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${outgoing ? 'items-end' : 'items-start'} flex flex-col`}>
        {outgoing && (
          <span className="flex items-center gap-1 mb-1 text-[10px] font-medium text-on-surface-variant">
            {message.sender === 'model' ? (
              <>
                <Bot className="w-3 h-3" /> AI assistant
              </>
            ) : (
              <>
                <UserRound className="w-3 h-3" /> Team member
              </>
            )}
          </span>
        )}
        <div
          className={`px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word shadow-sm ${BUBBLE_STYLES[message.sender]}`}
        >
          {message.attachment && (
            <AttachmentCard attachment={message.attachment} selected={documentSelected} onOpen={onOpenDocument} />
          )}
          {message.content && <p className={message.attachment ? 'mt-2' : ''}>{message.content}</p>}
        </div>
        <span className="flex items-center gap-1 mt-1 text-[10px] text-on-surface-variant">
          {message.time}
          {outgoing &&
            (message.read ? (
              <CheckCheck className="w-3.5 h-3.5 text-primary" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            ))}
        </span>
      </div>
    </div>
  );
}
