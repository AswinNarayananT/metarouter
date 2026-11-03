import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Ban, CheckCircle2, ExternalLink, Loader2, MapPin, MessageSquare, PackageCheck, Store, Truck, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectConversation } from '@/store/chat/chatSlice';
import { formatPhone } from '@/store/chat/chatMappers';
import { changeOrderStatus } from '@/store/orders/orderThunks';
import { formatPrice } from '@/utils/formatPrice';
import type { OrderDetail, OrderEvent, OrderStatus } from '@/types/orderTypes';
import { ORDER_STATUS_LABELS } from '@/utils/orders';
import { FulfilmentBadge, OrderStatusBadge } from './OrderBadges';
import { OrderReasonDialog } from './OrderReasonDialog';

const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-on-surface-variant';

// The buttons for each next step (only the ones the server allows are shown)
const ACTIONS: Partial<Record<OrderStatus, { label: string; icon: LucideIcon; style: 'primary' | 'danger' | 'quiet' }>> = {
  accepted: { label: 'Accept order', icon: CheckCircle2, style: 'primary' },
  out_for_delivery: { label: 'Out for delivery', icon: Truck, style: 'primary' },
  ready_for_pickup: { label: 'Ready for pickup', icon: Store, style: 'primary' },
  delivered: { label: 'Mark delivered', icon: PackageCheck, style: 'primary' },
  picked_up: { label: 'Mark picked up', icon: PackageCheck, style: 'primary' },
  rejected: { label: 'Reject', icon: XCircle, style: 'danger' },
  cancelled: { label: 'Cancel order', icon: Ban, style: 'quiet' },
};

const ACTION_STYLES = {
  primary: 'bg-primary text-on-primary hover:bg-primary/90',
  danger: 'bg-error/10 text-error hover:bg-error/15',
  quiet: 'text-on-surface-variant hover:bg-surface-container',
};

function formatDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

function eventText(event: OrderEvent) {
  if (event.status === 'placed') return 'Placed by the customer in chat';
  return `${ORDER_STATUS_LABELS[event.status]}${event.user ? ` by ${event.user.name}` : ''}`;
}

/** Right-side panel with one order: number to check with the customer, where it goes, items, next steps and history. */
export function OrderDetailPanel({
  detail,
  isLoading,
  error,
  onClose,
}: {
  detail: OrderDetail | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const savingId = useAppSelector((state) => state.orders.savingId);
  const [asking, setAsking] = useState<'rejected' | 'cancelled' | null>(null);
  const order = detail?.order;

  if (!order || !detail) {
    return (
      <PanelFrame title="Order" onClose={onClose}>
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading order…
          </p>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
      </PanelFrame>
    );
  }

  const saving = savingId === order.id;
  const move = (status: OrderStatus) => {
    if (status === 'rejected' || status === 'cancelled') setAsking(status);
    else dispatch(changeOrderStatus({ orderId: order.id, status }));
  };
  const confirmReason = async (reason: string) => {
    if (!asking) return;
    const result = await dispatch(changeOrderStatus({ orderId: order.id, status: asking, reason }));
    if (changeOrderStatus.fulfilled.match(result)) setAsking(null);
  };

  const openChat = () => {
    if (order.conversation_id === null) return;
    dispatch(selectConversation(order.conversation_id));
    navigate('/dashboard/chats');
  };

  return (
    <PanelFrame title={`Order #${order.number}`} onClose={onClose}>
      {/* The number staff check with the customer */}
      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className={labelClass}>Order number</p>
            <p className="text-3xl font-bold font-mono tracking-tight text-on-surface">#{order.number}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <OrderStatusBadge status={order.status} />
            <span className="text-[11px] text-on-surface-variant">Placed {formatDateTime(order.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-outline-variant/30">
          <div className="min-w-0">
            <p className="text-sm font-medium text-on-surface truncate">{order.customer_name || formatPhone(order.customer_phone)}</p>
            {order.customer_name && <p className="text-xs text-on-surface-variant">{formatPhone(order.customer_phone)}</p>}
          </div>
          {order.conversation_id !== null && (
            <button
              type="button"
              onClick={openChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 shrink-0 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Open chat <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </section>

      {/* Where it goes */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h4 className={labelClass}>{order.fulfilment === 'delivery' ? 'Deliver to' : 'Pickup'}</h4>
          <FulfilmentBadge fulfilment={order.fulfilment} />
        </div>
        {order.fulfilment === 'delivery' ? (
          <div className="space-y-1">
            <p className="text-sm text-on-surface whitespace-pre-wrap">{order.delivery_address}</p>
            {order.map_url && (
              <a href={order.map_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <MapPin className="w-3.5 h-3.5" /> Open in Maps
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-on-surface">The customer collects it from the store.</p>
        )}
      </section>

      {/* Items */}
      <section>
        <h4 className={`${labelClass} mb-2`}>Items</h4>
        <ul className="rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/20">
          {(order.items ?? []).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block text-on-surface truncate">{item.name}</span>
                <span className="block text-xs text-on-surface-variant">
                  {item.quantity} × {formatPrice(item.unit_price, order.currency)}
                </span>
              </span>
              <span className="font-medium text-on-surface shrink-0">{formatPrice(item.line_total, order.currency)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-on-surface">
            <span>Total ({order.fulfilment === 'delivery' ? 'pay on delivery' : 'pay at pickup'})</span>
            <span>{formatPrice(order.total, order.currency)}</span>
          </li>
        </ul>
      </section>

      {/* Next steps */}
      {order.next_statuses.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {order.next_statuses.map((status) => {
            const action = ACTIONS[status];
            if (!action) return null;
            return (
              <button
                key={status}
                type="button"
                onClick={() => move(status)}
                disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-60 cursor-pointer ${ACTION_STYLES[action.style]}`}
              >
                {saving && action.style === 'primary' ? <Loader2 className="w-4 h-4 animate-spin" /> : <action.icon className="w-4 h-4" />} {action.label}
              </button>
            );
          })}
        </section>
      )}
      {order.status === 'placed' && <p className="-mt-3 text-xs text-on-surface-variant">Accepting takes the items out of stock and messages the customer.</p>}
      {/* Failed changes (short stock, already changed by someone else) show as toasts */}

      {/* History */}
      <section>
        <h4 className={`${labelClass} mb-2`}>History</h4>
        <ol className="space-y-3 border-l border-outline-variant/40 pl-4">
          {detail.events.map((event) => (
            <li key={event.id} className="relative text-xs">
              <span className={`absolute -left-[1.3rem] top-1 w-2 h-2 rounded-full ${event.customer_notified === false ? 'bg-amber-500' : 'bg-outline-variant'}`} />
              <span className="text-on-surface">{eventText(event)}</span>
              {event.note && <span className="block mt-0.5 text-on-surface-variant">Reason: {event.note}</span>}
              {event.customer_notified === true && <span className="block mt-0.5 text-on-surface-variant">Customer messaged on WhatsApp</span>}
              {event.customer_notified === false && (
                <span className="flex items-start gap-1.5 mt-1 p-2 rounded-lg bg-amber-500/10 text-on-surface">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-amber-700" />
                  Customer not messaged: WhatsApp's 24-hour window had closed, or the chat isn't available. Let them know another way.
                </span>
              )}
              <span className="block text-on-surface-variant">{formatDateTime(event.created_at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {asking && (
        <OrderReasonDialog
          orderNumber={order.number}
          action={asking}
          stockReturns={asking === 'cancelled' && order.status !== 'placed'}
          busy={saving}
          onCancel={() => setAsking(null)}
          onConfirm={confirmReason}
        />
      )}
    </PanelFrame>
  );
}

function PanelFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[28rem] z-40 flex flex-col bg-surface-container-lowest border-l border-border-subtle shadow-2xl">
      <div className="h-16 shrink-0 flex items-center justify-between gap-3 px-5 border-b border-outline-variant/30">
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close order panel" className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">{children}</div>
    </aside>
  );
}
