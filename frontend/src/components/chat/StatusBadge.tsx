import { Bot, Hand } from 'lucide-react';
import type { ConversationStatus } from '@/types/chatTypes';

/** Shows whether the AI or a team member is handling the conversation. */
export function StatusBadge({ status }: { status: ConversationStatus }) {
  return status === 'human_takeover' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600">
      <Hand className="w-3 h-3" />
      Human
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
      <Bot className="w-3 h-3" />
      AI
    </span>
  );
}
