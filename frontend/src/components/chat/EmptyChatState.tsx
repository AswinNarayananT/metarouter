import { MessageSquare } from 'lucide-react';

/** Shown in the chat area when no conversation is selected. */
export function EmptyChatState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center bg-surface-container-lowest">
      <span className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
        <MessageSquare className="w-7 h-7" />
      </span>
      <h2 className="text-base font-semibold text-on-surface">Select a conversation</h2>
      <p className="text-sm text-on-surface-variant max-w-xs">
        Choose a chat from the list to view messages and reply to customers.
      </p>
    </div>
  );
}
