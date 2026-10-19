import { AlertCircle, Bot, Check, CheckCheck, Clock, Megaphone, UserRound } from 'lucide-react';
import type { ChatMessage } from '@/types/chatTypes';
import { AttachmentCard } from './AttachmentCard';

const BUBBLE_STYLES: Record<ChatMessage['sender'], string> = {
  user: 'bg-surface-container-low text-on-surface rounded-2xl rounded-tl-sm border border-outline-variant/30',
  model: 'bg-primary text-on-primary rounded-2xl rounded-tr-sm',
  human: 'bg-surface-container-high text-on-surface rounded-2xl rounded-tr-sm',
  broadcast: 'bg-surface-container-high text-on-surface rounded-2xl rounded-tr-sm',
};

const SENDER_LABELS = {
  model: { icon: Bot, label: 'AI assistant' },
  human: { icon: UserRound, label: 'Team member' },
  broadcast: { icon: Megaphone, label: 'Broadcast' },
};

// WhatsApp-style ticks: clock while queued, one tick sent, two delivered, two coloured read
function DeliveryTick({ message }: { message: ChatMessage }) {
  switch (message.status) {
    case 'pending':
      return <Clock className="w-3 h-3" aria-label="Sending" />;
    case 'sent':
      return <Check className="w-3.5 h-3.5" aria-label="Sent" />;
    case 'delivered':
      return <CheckCheck className="w-3.5 h-3.5" aria-label="Delivered" />;
    case 'read':
      return <CheckCheck className="w-3.5 h-3.5 text-primary" aria-label="Read" />;
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 text-error" aria-label="Not delivered" />;
    default:
      return null;
  }
}

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
  const sender = message.sender === 'user' ? null : SENDER_LABELS[message.sender];
  const failed = message.status === 'failed';

  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${outgoing ? 'items-end' : 'items-start'} flex flex-col`}>
        {sender && (
          <span className="flex items-center gap-1 mb-1 text-[10px] font-medium text-on-surface-variant">
            <sender.icon className="w-3 h-3" /> {sender.label}
          </span>
        )}
        <div
          className={`px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word shadow-sm ${BUBBLE_STYLES[message.sender]} ${failed ? 'opacity-70' : ''}`}
        >
          {message.attachment && (
            <AttachmentCard attachment={message.attachment} selected={documentSelected} onOpen={onOpenDocument} />
          )}
          {message.content && <p className={message.attachment ? 'mt-2' : ''}>{message.content}</p>}
        </div>
        <span className="flex items-center gap-1 mt-1 text-[10px] text-on-surface-variant">
          {message.time}
          {outgoing && <DeliveryTick message={message} />}
        </span>
        {failed && (
          <span className="mt-0.5 text-[11px] text-error text-right">
            Not delivered{message.error ? `: ${message.error}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
