import type { OrderStatus } from '@/types/orderTypes';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'New',
  accepted: 'Accepted',
  out_for_delivery: 'Out for delivery',
  ready_for_pickup: 'Ready for pickup',
  delivered: 'Delivered',
  picked_up: 'Picked up',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
