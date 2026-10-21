import { Bot, UserRound } from 'lucide-react';
import type { Ticket, TicketStatus, TicketType } from '@/types/ticketTypes';

const TYPE_STYLES: Record<TicketType, { label: string; className: string }> = {
  enquiry: { label: 'Enquiry', className: 'bg-primary/10 text-primary' },
  problem: { label: 'Problem', className: 'bg-amber-500/10 text-amber-700' },
  complaint: { label: 'Complaint', className: 'bg-error/10 text-error' },
};

const STATUS_STYLES: Record<TicketStatus, { label: string; className: string }> = {
  ai_handling: { label: 'AI handling', className: 'bg-surface-container-high text-on-surface-variant' },
  open: { label: 'Open', className: 'bg-amber-500/15 text-amber-700' },
  in_progress: { label: 'In progress', className: 'bg-primary/10 text-primary' },
  waiting: { label: 'Waiting on customer', className: 'bg-purple-500/10 text-purple-700' },
  closed: { label: 'Closed', className: 'bg-green-500/10 text-green-700' },
};

const pill = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap';

export function TicketTypeBadge({ type }: { type: TicketType | null }) {
  if (!type) return <span className={`${pill} bg-surface-container text-on-surface-variant`}>Not filed yet</span>;
  const style = TYPE_STYLES[type];
  return <span className={`${pill} ${style.className}`}>{style.label}</span>;
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const style = STATUS_STYLES[status];
  return <span className={`${pill} ${style.className}`}>{style.label}</span>;
}

// Who handled it: the AI alone, or a team member at some point
export function TicketHandlerBadge({ ticket }: { ticket: Ticket }) {
  return ticket.handled_by === 'ai' ? (
    <span className={`${pill} bg-surface-container text-on-surface-variant`}>
      <Bot className="w-3 h-3" /> AI
    </span>
  ) : (
    <span className={`${pill} bg-surface-container text-on-surface-variant`}>
      <UserRound className="w-3 h-3" /> {ticket.assigned_to?.name.split(' ')[0] ?? 'Team'}
    </span>
  );
}
