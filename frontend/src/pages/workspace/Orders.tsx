import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Search, ShoppingBag } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectOrder, setOrderFilters } from '@/store/orders/orderSlice';
import { fetchOrderDetail, fetchOrders } from '@/store/orders/orderThunks';
import { formatListTime, formatPhone } from '@/store/chat/chatMappers';
import { useOrdersRealtimeSync } from '@/hooks/useChatRealtime';
import { markNotificationsRead } from '@/store/notifications/notificationThunks';
import { usePageFocused } from '@/hooks/usePageFocused';
import { formatPrice } from '@/utils/formatPrice';
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel';
import { FulfilmentBadge, OrderStatusBadge } from '@/components/orders/OrderBadges';
import type { OrderFulfilment, OrderStatus, OrderTab } from '@/types/orderTypes';

const SEARCH_DEBOUNCE_MS = 300;

const TABS: { id: OrderTab; label: string; statuses: OrderStatus[] | null }[] = [
  { id: 'active', label: 'Active', statuses: ['placed', 'accepted', 'out_for_delivery', 'ready_for_pickup'] },
  { id: 'placed', label: 'New', statuses: ['placed'] },
  { id: 'accepted', label: 'Accepted', statuses: ['accepted'] },
  { id: 'on_the_way', label: 'On the way / Ready', statuses: ['out_for_delivery', 'ready_for_pickup'] },
  { id: 'completed', label: 'Completed', statuses: ['delivered', 'picked_up'] },
  { id: 'closed', label: 'Rejected & cancelled', statuses: ['rejected', 'cancelled'] },
  { id: 'all', label: 'All', statuses: null },
];

const selectClass =
  'px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary cursor-pointer';

export function Orders() {
  const dispatch = useAppDispatch();
  const { items, total, page, totalPages, statusCounts, filters, isLoading, loadError, selectedId, detail, isLoadingDetail, detailError } = useAppSelector(
    (state) => state.orders
  );
  const [searchText, setSearchText] = useState(filters.search);
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Load the list whenever a filter changes
  useEffect(() => {
    dispatch(fetchOrders({ page: 1 }));
  }, [dispatch, filters]);

  // 2. Search after the user stops typing
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText !== filters.search) dispatch(setOrderFilters({ search: searchText }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, searchText, filters.search]);

  const openOrder = (orderId: number) => {
    dispatch(selectOrder(orderId));
    dispatch(fetchOrderDetail(orderId));
  };

  // 3. From a "New order #1023" notification: /dashboard/orders?order=42 opens that order
  const linkedOrder = Number(searchParams.get('order'));
  useEffect(() => {
    if (!linkedOrder) return;
    dispatch(selectOrder(linkedOrder));
    dispatch(fetchOrderDetail(linkedOrder));
    setSearchParams({}, { replace: true });
  }, [dispatch, linkedOrder, setSearchParams]);

  // Looking at an order = its "New order" notification is dealt with (only while the tab is in front)
  const notifications = useAppSelector((state) => state.notifications.items);
  const pageFocused = usePageFocused();
  const hasUnreadForOrder = selectedId !== null && notifications.some((n) => n.order_id === selectedId && !n.read_at);
  useEffect(() => {
    if (pageFocused && selectedId !== null && hasUnreadForOrder) dispatch(markNotificationsRead({ orderId: selectedId }));
  }, [dispatch, pageFocused, selectedId, hasUnreadForOrder]);

  // 4. Live updates; leaving the page closes the details panel
  useOrdersRealtimeSync();
  useEffect(() => () => {
    dispatch(selectOrder(null));
  }, [dispatch]);

  const tabCount = (statuses: OrderStatus[] | null) =>
    statuses ? statuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0) : Object.values(statusCounts).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Orders</h1>
        <p className="text-sm text-on-surface-variant">
          Orders customers place in WhatsApp. Accept them to take the items out of stock, then move them along. The customer gets a message at each key step.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Order status">
        {TABS.map((tab) => {
          const active = filters.tab === tab.id;
          const count = tabCount(tab.statuses);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => dispatch(setOrderFilters({ tab: tab.id }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              {tab.label}
              <span
                className={`min-w-5 px-1 rounded-full text-[10px] ${
                  active ? 'bg-on-primary/20' : tab.id === 'placed' && count > 0 ? 'bg-amber-500/20 text-amber-800 font-bold' : 'bg-surface-container'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search #order number, customer name or phone"
            aria-label="Search orders"
            className="w-full pl-9 pr-4 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
          />
        </div>
        <select
          aria-label="Delivery or pickup"
          value={filters.fulfilment}
          onChange={(e) => dispatch(setOrderFilters({ fulfilment: e.target.value as OrderFulfilment | '' }))}
          className={selectClass}
        >
          <option value="">Delivery and pickup</option>
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
        </select>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-on-surface-variant" />
            ) : (
              <>
                <ShoppingBag className="w-8 h-8 text-on-surface-variant/50" />
                <p className="text-sm text-on-surface-variant">{loadError ?? 'No orders here. They appear as customers order in WhatsApp.'}</p>
              </>
            )}
          </div>
        ) : (
          <ul>
            {items.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => openOrder(order.id)}
                  aria-current={order.id === selectedId ? 'true' : undefined}
                  className={`w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 text-left border-b border-l-4 border-b-outline-variant/20 transition-colors cursor-pointer ${
                    order.status === 'placed' ? 'border-l-amber-500' : 'border-l-transparent'
                  } ${order.id === selectedId ? 'bg-primary/5' : 'hover:bg-surface-container'}`}
                >
                  <span className="text-sm font-mono font-bold text-on-surface w-16 shrink-0">#{order.number}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-on-surface truncate">{order.customer_name || formatPhone(order.customer_phone)}</span>
                    <span className="block text-xs text-on-surface-variant truncate">
                      {order.item_count} item{order.item_count === 1 ? '' : 's'} · {order.items_summary}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-on-surface shrink-0 sm:w-24 sm:text-right">{formatPrice(order.total, order.currency)}</span>
                  <span className="flex flex-wrap items-center gap-1.5 shrink-0 sm:w-56">
                    <FulfilmentBadge fulfilment={order.fulfilment} />
                    <OrderStatusBadge status={order.status} />
                  </span>
                  <span className="text-[11px] text-on-surface-variant w-16 shrink-0 sm:text-right">{formatListTime(order.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {page < totalPages && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => dispatch(fetchOrders({ page: page + 1 }))}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container disabled:opacity-60 cursor-pointer"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />} Load more ({items.length} of {total})
          </button>
        </div>
      )}

      {selectedId !== null && (
        <OrderDetailPanel detail={detail} isLoading={isLoadingDetail} error={detailError} onClose={() => dispatch(selectOrder(null))} />
      )}
    </div>
  );
}
