import { Bot, ExternalLink, Megaphone, MessageSquare, Phone } from 'lucide-react';
import type { ChatConversation } from '@/types/chatTypes';
import { AttachmentCard } from './AttachmentCard';
import { Avatar } from './Avatar';
import { SidePanel } from './SidePanel';
import { StatusBadge } from './StatusBadge';
import { CustomerTickets } from './CustomerTickets';

/** Right sidebar with the customer's details and every document they've shared. */
export function ContactPanel({
  conversation,
  onClose,
  onOpenDocument,
}: {
  conversation: ChatConversation;
  onClose: () => void;
  onOpenDocument: (messageId: number) => void;
}) {
  const documents = conversation.messages.filter((m) => m.attachment);

  return (
    <SidePanel title="Contact details" closeLabel="Close contact details" onClose={onClose}>
      <div className="flex flex-col items-center text-center gap-2">
        <Avatar name={conversation.name} size="lg" />
        <div>
          <p className="text-sm font-semibold text-on-surface">{conversation.name}</p>
          {conversation.hasName && <p className="text-xs text-on-surface-variant">{conversation.phone}</p>}
        </div>
        <StatusBadge status={conversation.status} />
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-on-surface-variant">
            <Phone className="w-4 h-4" /> Channel
          </dt>
          <dd className="text-on-surface font-medium">WhatsApp</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-on-surface-variant">
            <MessageSquare className="w-4 h-4" /> Messages
          </dt>
          <dd className="text-on-surface font-medium">{conversation.messages.filter((m) => m.sender !== 'system').length}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-on-surface-variant">
            <Bot className="w-4 h-4" /> AI replies
          </dt>
          <dd className="text-on-surface font-medium">
            {conversation.messages.filter((m) => m.sender === 'model').length}
          </dd>
        </div>
      </dl>

      {/* Every support session this customer has had */}
      <CustomerTickets conversationId={conversation.id} refreshKey={`${conversation.openTicket?.id ?? 'none'}-${conversation.openTicket?.status ?? ''}`} />

      {/* Click-to-WhatsApp ad that started this chat */}
      {conversation.adReferral && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Came from an ad</h3>
          <div className="p-3 rounded-xl bg-surface border border-outline-variant/30 space-y-1">
            <p className="flex items-start gap-2 text-sm font-semibold text-on-surface">
              <Megaphone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              {conversation.adReferral.headline || (conversation.adReferral.sourceType === 'post' ? 'Facebook / Instagram post' : 'Click-to-WhatsApp ad')}
            </p>
            {conversation.adReferral.body && (
              <p className="text-xs text-on-surface-variant line-clamp-3">{conversation.adReferral.body}</p>
            )}
            {conversation.adReferral.sourceUrl && (
              <a
                href={conversation.adReferral.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View {conversation.adReferral.sourceType === 'post' ? 'post' : 'ad'} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Shortcut to every document in this chat */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Documents shared</h3>
          <div className="space-y-2">
            {documents.map((m) => (
              <AttachmentCard
                key={m.id}
                attachment={m.attachment!}
                selected={false}
                onOpen={() => onOpenDocument(m.id)}
              />
            ))}
          </div>
        </div>
      )}
    </SidePanel>
  );
}
