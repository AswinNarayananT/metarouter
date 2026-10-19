import { Bot, Paperclip, UserRound } from 'lucide-react';
import type { ChatConversation } from '@/types/chatTypes';
import { Avatar } from './Avatar';
import { StatusBadge } from './StatusBadge';

export function ConversationListItem({
  conversation,
  active,
  onSelect,
}: {
  conversation: ChatConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const last = conversation.lastMessage;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left border-l-2 transition-colors cursor-pointer ${
        active ? 'bg-primary/5 border-primary' : 'border-transparent hover:bg-surface-container'
      }`}
    >
      <Avatar name={conversation.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-on-surface truncate">{conversation.name}</h2>
          <span
            className={`text-[11px] shrink-0 ${
              conversation.unread ? 'text-primary font-semibold' : 'text-on-surface-variant'
            }`}
          >
            {conversation.lastActive}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-on-surface-variant truncate">
            {last?.sender === 'model' && <Bot className="inline w-3 h-3 mr-1 -mt-0.5" />}
            {last?.sender === 'human' && <UserRound className="inline w-3 h-3 mr-1 -mt-0.5" />}
            {last?.attachment ? (
              <>
                <Paperclip className="inline w-3 h-3 mr-1 -mt-0.5" />
                {last.attachment.fileName}
              </>
            ) : (
              last?.content
            )}
          </p>
          {conversation.unread > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
              {conversation.unread}
            </span>
          )}
        </div>
        <div className="mt-1.5">
          <StatusBadge status={conversation.status} />
        </div>
      </div>
    </button>
  );
}
