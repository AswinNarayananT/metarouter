import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserRound, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectConversation } from '@/store/chat/chatSlice';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { formatPhone } from '@/store/chat/chatMappers';

const MAX_ALERTS = 3;
const AUTO_DISMISS_MS = 15_000;

interface HandoverAlert {
  conversationId: number;
  phone: string;
  preview: string;
}

// Top-right cards (just under the navbar) when the AI hands a chat to the team, on every workspace page
export function HandoverAlerts() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedId = useAppSelector((state) => state.chat.selectedId);
  const [alerts, setAlerts] = useState<HandoverAlert[]>([]);

  useRealtimeEvent('conversation.handover', (conversation) => {
    // Already looking at this chat: the takeover banner says it
    if (location.pathname.startsWith('/dashboard/chats') && selectedId === conversation.id) return;

    const alert = {
      conversationId: conversation.id,
      phone: conversation.customer_name || formatPhone(conversation.customer_phone),
      preview: conversation.last_message?.content ?? '',
    };
    setAlerts((current) => [alert, ...current.filter((a) => a.conversationId !== conversation.id)].slice(0, MAX_ALERTS));
  });

  // Each card disappears on its own after a while
  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = window.setTimeout(() => setAlerts((current) => current.slice(0, -1)), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [alerts]);

  const dismiss = (conversationId: number) => setAlerts((current) => current.filter((a) => a.conversationId !== conversationId));

  const open = (conversationId: number) => {
    // The chats page opens with this chat selected
    dismiss(conversationId);
    dispatch(selectConversation(conversationId));
    navigate('/dashboard/chats');
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {alerts.map((alert) => (
        <div
          key={alert.conversationId}
          className="flex items-start gap-3 p-4 rounded-2xl bg-surface-container-low border border-amber-500/30 shadow-lg"
        >
          <span className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
            <UserRound className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-on-surface">A customer needs a human</p>
            <p className="text-xs text-on-surface-variant truncate">
              {alert.phone}
              {alert.preview ? ` · ${alert.preview}` : ''}
            </p>
            <button
              type="button"
              onClick={() => open(alert.conversationId)}
              className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              Open chat
            </button>
          </div>
          <button
            type="button"
            onClick={() => dismiss(alert.conversationId)}
            aria-label="Dismiss"
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
