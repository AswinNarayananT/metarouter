import { AlertCircle, Bot, Check, CheckCheck, Clock, MapPin, Megaphone, UserRound } from 'lucide-react';
import type { ChatMessage } from '@/types/chatTypes';
import { AttachmentCard } from './AttachmentCard';
import { StickerImage, VideoNote, VoiceNote } from './MediaMessage';

const BUBBLE_STYLES: Record<ChatMessage['sender'], string> = {
  user: 'bg-surface-container-low text-on-surface rounded-2xl rounded-tl-sm border border-outline-variant/30',
  model: 'bg-primary text-on-primary rounded-2xl rounded-tr-sm',
  human: 'bg-surface-container-high text-on-surface rounded-2xl rounded-tr-sm',
  broadcast: 'bg-surface-container-high text-on-surface rounded-2xl rounded-tr-sm',
  system: '',
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
  // Activity line ("Aromal took this chat"): a small centred note, not a bubble
  if (message.sender === 'system') {
    return (
      <div className="flex justify-center">
        <span className="max-w-[90%] px-3 py-1 rounded-full bg-surface-container text-[11px] text-on-surface-variant text-center">
          {message.content} · {message.time}
        </span>
      </div>
    );
  }

  const kind = message.attachment?.kind;
  const outgoing = message.sender !== 'user';

  // Sticker: shown on its own, without a bubble (like WhatsApp)
  if (kind === 'sticker' && message.attachment) {
    return (
      <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex flex-col ${outgoing ? 'items-end' : 'items-start'}`}>
          <StickerImage attachment={message.attachment} />
          {message.reaction && <span className="-mt-2 mx-2 px-1.5 py-0.5 rounded-full bg-surface-container-low border border-outline-variant/40 text-sm leading-none">{message.reaction}</span>}
          <span className="mt-1 text-[10px] text-on-surface-variant">{message.time}</span>
        </div>
      </div>
    );
  }

  const baseLabel = message.sender === 'user' ? null : SENDER_LABELS[message.sender];
  // Agent replies show who wrote them
  const sender = baseLabel && message.sender === 'human' && message.sentBy ? { ...baseLabel, label: message.sentBy.name } : baseLabel;
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
          {kind === 'audio' && message.attachment && <VoiceNote attachment={message.attachment} />}
          {kind === 'video' && message.attachment && <VideoNote attachment={message.attachment} />}
          {message.attachment && !['audio', 'video'].includes(kind ?? '') && (
            <AttachmentCard attachment={message.attachment} selected={documentSelected} onOpen={onOpenDocument} />
          )}
          {/* Voice notes show their transcript above; placeholders like "[Sent a video]" aren't repeated */}
          {message.content && kind !== 'audio' && !(kind === 'video' && message.content.startsWith('[')) && (
            <p className={message.attachment ? 'mt-2' : ''}>{message.content}</p>
          )}
          {message.location && (
            <a
              href={`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
            >
              <MapPin className="w-3.5 h-3.5" /> Open in Maps
            </a>
          )}
        </div>
        {message.reaction && (
          <span className="-mt-2 mx-2 px-1.5 py-0.5 rounded-full bg-surface-container-low border border-outline-variant/40 text-sm leading-none shadow-sm" aria-label={`Reaction ${message.reaction}`}>
            {message.reaction}
          </span>
        )}
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
