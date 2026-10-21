import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/api/axios';
import { useAppDispatch } from '@/store';
import { selectTicket } from '@/store/tickets/ticketSlice';
import { fetchTicketDetail } from '@/store/tickets/ticketThunks';
import { formatListTime } from '@/store/chat/chatMappers';
import { TicketStatusBadge, TicketTypeBadge } from '@/components/tickets/TicketBadges';
import type { Ticket } from '@/types/ticketTypes';

/** The customer's ticket history (contact panel): every support session, newest first. */
export function CustomerTickets({ conversationId, refreshKey }: { conversationId: number; refreshKey: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [state, setState] = useState<{ forId: number | null; tickets: Ticket[]; failed: boolean }>({ forId: null, tickets: [], failed: false });

  // Reload when the chat changes or its open ticket changes (refreshKey)
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ tickets: Ticket[] }>('/api/v1/tickets/', { params: { conversation_id: conversationId, page_size: 20 } })
      .then((response) => !cancelled && setState({ forId: conversationId, tickets: response.data.tickets, failed: false }))
      .catch(() => !cancelled && setState({ forId: conversationId, tickets: [], failed: true }));
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshKey]);

  const openTicket = (ticketId: number) => {
    dispatch(selectTicket(ticketId));
    dispatch(fetchTicketDetail(ticketId));
    navigate('/dashboard/tickets');
  };

  const loading = state.forId !== conversationId;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Ticket history</h3>
      {loading && <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />}
      {!loading && state.failed && <p className="text-xs text-error">Couldn't load tickets.</p>}
      {!loading && !state.failed && state.tickets.length === 0 && <p className="text-xs text-on-surface-variant">No tickets yet.</p>}
      {!loading &&
        state.tickets.map((ticket) => (
          <button
            key={ticket.id}
            type="button"
            onClick={() => openTicket(ticket.id)}
            className="w-full p-2.5 rounded-xl border border-outline-variant/40 bg-surface text-left hover:border-primary/50 hover:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-on-surface truncate">
                #{ticket.number} {ticket.subject}
              </span>
              <span className="text-[10px] text-on-surface-variant shrink-0">{formatListTime(ticket.created_at)}</span>
            </span>
            <span className="mt-1 flex flex-wrap gap-1">
              <TicketStatusBadge status={ticket.status} />
              <TicketTypeBadge type={ticket.type} />
            </span>
            {ticket.subgroup && (
              <span className="block mt-1 text-[11px] text-on-surface-variant truncate">
                {ticket.group?.name} › {ticket.subgroup.name}
              </span>
            )}
          </button>
        ))}
    </div>
  );
}
