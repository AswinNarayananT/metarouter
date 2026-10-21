import { Bot, CheckCircle2, Lightbulb } from 'lucide-react';

/**
 * Shown to the agent after they've replied in a chat with an open ticket:
 * handing back lets the AI ask "anything else?" and close the ticket itself.
 */
export function TicketHint({
  ticketNumber,
  busy,
  onHandBack,
  onCloseTicket,
}: {
  ticketNumber: number;
  busy: boolean;
  onHandBack: () => void;
  onCloseTicket: () => void;
}) {
  return (
    <div className="shrink-0 px-3 sm:px-5 py-2 border-t border-outline-variant/30 bg-primary/5">
      <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex-1 min-w-56 flex items-start gap-2 text-xs text-on-surface">
          <Lightbulb className="w-4 h-4 text-primary shrink-0" />
          <span>
            <span className="font-semibold">Done helping?</span> Hand back to the AI: it asks if they need anything else and closes ticket #{ticketNumber}
            {' '}for you.
          </span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onHandBack}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-medium hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5" /> Hand back to AI
          </button>
          <button
            type="button"
            onClick={onCloseTicket}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-medium hover:bg-surface-container-high disabled:opacity-60 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Close ticket
          </button>
        </div>
      </div>
    </div>
  );
}
