/* Orders — mirror GET /api/v1/orders (backend order_service.serialize_order) */

export type OrderStatus = 'placed' | 'accepted' | 'out_for_delivery' | 'ready_for_pickup' | 'delivered' | 'picked_up' | 'rejected' | 'cancelled';
export type OrderFulfilment = 'delivery' | 'pickup';

export interface Order {
  id: number;
  number: number;                    // "Order #1023": what the customer and delivery / pickup staff check
  conversation_id: number | null;
  status: OrderStatus;
  next_statuses: OrderStatus[];      // Steps the team can take from here
  fulfilment: OrderFulfilment;
  customer_name: string | null;
  customer_phone: string;
  delivery_address: string | null;   // Delivery only
  map_url: string | null;            // Delivery with a shared pin
  currency: string;
  total: string;                     // "341.00"
  item_count: number;
  items_summary: string;             // "Tata Salt 1kg × 2, Aashirvaad Atta 5kg × 1"
  created_at: string;
  updated_at: string | null;
  items?: OrderItem[];               // Detail only
}

export interface OrderItem {
  id: number;
  product_id: number | null;
  name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface OrderEvent {
  id: number;
  status: OrderStatus;
  note: string | null;                // Reject / cancel reason
  customer_notified: boolean | null;  // null = this step sends no WhatsApp message
  user: { id: number; name: string } | null; // null = the customer, in chat
  created_at: string;
}

export interface OrderDetail {
  order: Order;
  events: OrderEvent[];
}

// List tabs: active = the team's work (new, accepted, on the way / ready)
export type OrderTab = 'active' | 'placed' | 'accepted' | 'on_the_way' | 'completed' | 'closed' | 'all';

export interface OrderFilters {
  tab: OrderTab;
  fulfilment: OrderFulfilment | '';
  search: string;
}

export interface OrderState {
  items: Order[];
  total: number;
  page: number;
  totalPages: number;
  statusCounts: Partial<Record<OrderStatus, number>>;
  currency: string;
  filters: OrderFilters;
  isLoading: boolean;
  loadError: string | null;
  selectedId: number | null;
  detail: OrderDetail | null;
  isLoadingDetail: boolean;
  detailError: string | null;
  savingId: number | null;           // Order with a status change being saved
}
