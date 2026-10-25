import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlarmClock, Ticket as TicketIcon, UserPlus, UserRound, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectConversation } from '@/store/chat/chatSlice';
import { selectTicket } from '@/store/tickets/ticketSlice';
import { fetchTicketDetail } from '@/store/tickets/ticketThunks';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { formatPhone } from '@/store/chat/chatMappers';

const MAX_ALERTS = 3;
const AUTO_DISMISS_MS = 15_000;

interface Alert {
  key: string;            // One card per chat / ticket
  kind: 'handover' | 'assigned' | 'ticket_assigned' | 'reminder';
  title: string;
  body: string;
  conversationId: number;
  ticketId: number | null; // Ticket assignments open the ticket
}

const KIND_STYLES = {
  handover: { icon: UserRound, className: 'bg-amber-500/15 text-amber-700', border: 'border-amber-500/30' },
  assigned: { icon: UserPlus, className: 'bg-primary/10 text-primary', border: 'border-primary/30' },
  ticket_assigned: { icon: TicketIcon, className: 'bg-primary/10 text-primary', border: 'border-primary/30' },
  reminder: { icon: AlarmClock, className: 'bg-amber-500/15 text-amber-700', border: 'border-amber-500/50' },
};

// Top-right cards (just under the navbar) on every workspace page:
// the AI handed a chat to the team, a handed-over chat is still waiting, or someone assigned you a chat / ticket
export function HandoverAlerts() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedId = useAppSelector((state) => state.chat.selectedId);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const push = (alert: Alert) => setAlerts((current) => [alert, ...current.filter((a) => a.key !== alert.key)].slice(0, MAX_ALERTS));

  useRealtimeEvent('conversation.handover', (conversation) => {
    // Already looking at this chat: the takeover banner says it
    if (location.pathname.startsWith('/dashboard/chats') && selectedId === conversation.id) return;
    const customer = conversation.customer_name || formatPhone(conversation.customer_phone);
    const preview = conversation.last_message?.content;
    push({
      key: `chat-${conversation.id}`,
      kind: 'handover',
      title: 'A customer needs a human',
      body: preview ? `${customer} · ${preview}` : customer,
      conversationId: conversation.id,
      ticketId: null,
    });
  });

  // Assignments and "still waiting" reminders: same title and text as the bell ("Aromal assigned you ticket #12 · John Doe")
  useRealtimeEvent('notification.new', (notification) => {
    if (notification.type === 'handover') return; // Shown from conversation.handover above
    if (notification.conversation_id === null) return;
    push({
      key: notification.ticket ? `ticket-${notification.ticket.id}` : `chat-${notification.conversation_id}`,
      kind: notification.type,
      title: notification.title,
      body: notification.body ?? '',
      conversationId: notification.conversation_id,
      ticketId: notification.ticket?.id ?? null,
    });
  });

  // Each card disappears on its own after a while
  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = window.setTimeout(() => setAlerts((current) => current.slice(0, -1)), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [alerts]);

  const dismiss = (key: string) => setAlerts((current) => current.filter((a) => a.key !== key));

  // Ticket alerts open the ticket; the rest open the chat
  const open = (alert: Alert) => {
    dismiss(alert.key);
    if (alert.ticketId) {
      dispatch(selectTicket(alert.ticketId));
      dispatch(fetchTicketDetail(alert.ticketId));
      navigate('/dashboard/tickets');
    } else {
      dispatch(selectConversation(alert.conversationId));
      navigate('/dashboard/chats');
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {alerts.map((alert) => {
        const style = KIND_STYLES[alert.kind];
        return (
          <div key={alert.key} className={`flex items-start gap-3 p-4 rounded-2xl bg-surface-container-low border shadow-lg ${style.border}`}>
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${style.className}`}>
              <style.icon className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface">{alert.title}</p>
              {alert.body && <p className="text-xs text-on-surface-variant truncate">{alert.body}</p>}
              <button type="button" onClick={() => open(alert)} className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer">
                {alert.ticketId ? 'Open ticket' : 'Open chat'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => dismiss(alert.key)}
              aria-label="Dismiss"
              className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
