import { Hand } from 'lucide-react';

/** Strip under the chat header while a team member is handling the conversation. */
export function TakeoverBanner() {
  return (
    <div className="shrink-0 px-5 py-2 flex items-center gap-2 text-xs bg-amber-500/10 text-amber-700 border-b border-amber-500/20">
      <Hand className="w-3.5 h-3.5 shrink-0" />
      A team member is handling this chat. The AI assistant is paused.
    </div>
  );
}
