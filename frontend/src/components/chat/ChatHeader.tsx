import { ArrowLeft, Bot, Hand, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatConversation } from '@/types/chatTypes';
import { Avatar } from './Avatar';
import { StatusBadge } from './StatusBadge';
import { WindowTimerBadge } from './WindowTimerBadge';

/** Top bar of the open conversation: customer, status, takeover and details toggles. */
export function ChatHeader({
  conversation,
  contactOpen,
  onBack,
  onToggleTakeover,
  onToggleContact,
  assignControl,
  onOpenTemplates,
}: {
  conversation: ChatConversation;
  contactOpen: boolean;
  onBack: () => void;
  onToggleTakeover: () => void;
  onToggleContact: () => void;
  assignControl?: ReactNode; // Owner picker (AssignMenu)
  onOpenTemplates?: () => void;
}) {
  const isHuman = conversation.status === 'human_takeover';

  return (
    <header className="h-16 shrink-0 px-3 sm:px-5 flex items-center gap-2.5 sm:gap-3 border-b border-outline-variant/30 bg-surface-container-low">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to conversations"
        className="md:hidden p-2 -ml-1 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <Avatar name={conversation.name} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-on-surface truncate">{conversation.name}</h2>
        <p className="text-xs text-on-surface-variant truncate">
          {conversation.hasName ? conversation.phone : 'WhatsApp customer'}
          {conversation.adReferral && ' · From an ad'}
        </p>
      </div>

      <div className="hidden md:block">
        <StatusBadge status={conversation.status} />
      </div>

      <WindowTimerBadge
        windowOpen={conversation.windowOpen}
        windowExpiresAt={conversation.windowExpiresAt}
        onClick={!conversation.windowOpen ? onOpenTemplates : undefined}
      />

      {assignControl}
      <button
        type="button"
        onClick={onToggleTakeover}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
          isHuman
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/15'
        }`}
      >
        {isHuman ? (
          <>
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">Hand back to AI</span>
          </>
        ) : (
          <>
            <Hand className="w-4 h-4" />
            <span className="hidden sm:inline">Take over</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleContact}
        aria-label={contactOpen ? 'Hide contact details' : 'Show contact details'}
        aria-pressed={contactOpen}
        className={`p-2 rounded-lg transition-colors cursor-pointer ${
          contactOpen
            ? 'bg-primary/10 text-primary'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
        }`}
      >
        <Info className="w-5 h-5" />
      </button>
    </header>
  );
}
