import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Order, OrderFilters, OrderState } from '@/types/orderTypes';
import { changeOrderStatus, fetchOrderDetail, fetchOrders } from './orderThunks';

const initialState: OrderState = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 1,
  statusCounts: {},
  currency: 'INR',
  filters: { tab: 'active', fulfilment: '', search: '' },
  isLoading: false,
  loadError: null,
  selectedId: null,
  detail: null,
  isLoadingDetail: false,
  detailError: null,
  savingId: null,
};

const orderSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    setOrderFilters: (state, action: PayloadAction<Partial<OrderFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    selectOrder: (state, action: PayloadAction<number | null>) => {
      state.selectedId = action.payload;
      // Another order: never show the previous one's buttons while this one loads (a click would change the wrong order)
      if (state.detail?.order.id !== action.payload) {
        state.detail = null;
        state.detailError = null;
      }
    },
    // order.updated event: refresh the row (and the open details) if we have it
    orderReceived: (state, action: PayloadAction<Order>) => {
      const index = state.items.findIndex((o) => o.id === action.payload.id);
      if (index >= 0) state.items[index] = action.payload;
      if (state.detail?.order.id === action.payload.id) state.detail.order = { ...state.detail.order, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.isLoading = true;
        state.loadError = null;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        const { orders, total, page, total_pages, status_counts, currency } = action.payload;
        state.items = page === 1 ? orders : [...state.items, ...orders.filter((o) => !state.items.some((i) => i.id === o.id))];
        state.total = total;
        state.page = page;
        state.totalPages = total_pages;
        state.statusCounts = status_counts;
        state.currency = currency;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.isLoading = false;
        state.loadError = action.payload as string;
      })

      .addCase(fetchOrderDetail.pending, (state) => {
        state.isLoadingDetail = true;
        state.detailError = null;
      })
      .addCase(fetchOrderDetail.fulfilled, (state, action) => {
        state.isLoadingDetail = false;
        // Ignore a slow response for an order that's no longer open in the panel
        if (action.payload.order.id === state.selectedId) state.detail = action.payload;
      })
      .addCase(fetchOrderDetail.rejected, (state, action) => {
        state.isLoadingDetail = false;
        state.detailError = action.payload as string;
      })

      .addCase(changeOrderStatus.pending, (state, action) => {
        state.savingId = action.meta.arg.orderId;
      })
      .addCase(changeOrderStatus.fulfilled, (state, action) => {
        state.savingId = null;
        const { order, events } = action.payload;
        const index = state.items.findIndex((o) => o.id === order.id);
        if (index >= 0) state.items[index] = order;
        if (state.detail?.order.id === order.id) state.detail = { order, events };
      })
      .addCase(changeOrderStatus.rejected, (state) => {
        state.savingId = null;
      })
      // Logged out: never show one user's orders to the next one
      .addMatcher((action) => action.type === 'workspace/logoutWorkspace', () => initialState);
  },
});

export const { setOrderFilters, selectOrder, orderReceived } = orderSlice.actions;
export default orderSlice.reducer;
