import { Store, Truck } from 'lucide-react';
import type { OrderFulfilment, OrderStatus } from '@/types/orderTypes';
import { ORDER_STATUS_LABELS } from '@/utils/orders';

const STATUS_STYLES: Record<OrderStatus, string> = {
  placed: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  accepted: 'bg-primary/10 text-primary border-primary/20',
  out_for_delivery: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  ready_for_pickup: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  delivered: 'bg-green-500/10 text-green-700 border-green-500/20',
  picked_up: 'bg-green-500/10 text-green-700 border-green-500/20',
  rejected: 'bg-error/10 text-error border-error/20',
  cancelled: 'bg-surface-container text-on-surface-variant border-outline-variant/30',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_STYLES[status]}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

export function FulfilmentBadge({ fulfilment }: { fulfilment: OrderFulfilment }) {
  const Icon = fulfilment === 'delivery' ? Truck : Store;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-medium">
      <Icon className="w-3 h-3" /> {fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
    </span>
  );
}
