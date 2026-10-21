import { useNavigate } from 'react-router-dom';
import { Ticket as TicketIcon } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { selectTicket } from '@/store/tickets/ticketSlice';
import { fetchTicketDetail } from '@/store/tickets/ticketThunks';

const STATUS_LABELS: Record<string, string> = {
  ai_handling: 'AI handling',
  open: 'Open',
  in_progress: 'In progress',
  waiting: 'Waiting',
};

/** Chat header: the chat's open ticket; opens it on the Tickets page. */
export function TicketChip({ ticket }: { ticket: { id: number; number: number; status: string } }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const open = () => {
    dispatch(selectTicket(ticket.id));
    dispatch(fetchTicketDetail(ticket.id));
    navigate('/dashboard/tickets');
  };

  return (
    <button
      type="button"
      onClick={open}
      title="Open this chat's ticket"
      className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant/40 text-xs text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer"
    >
      <TicketIcon className="w-3.5 h-3.5" />#{ticket.number}
      <span className="text-[10px]">· {STATUS_LABELS[ticket.status] ?? ticket.status}</span>
    </button>
  );
}
