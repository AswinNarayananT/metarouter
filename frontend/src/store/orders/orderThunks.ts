import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { RootState } from '@/store';
import type { Order, OrderDetail, OrderStatus } from '@/types/orderTypes';

const ORDERS_PAGE_SIZE = 30;

// Current filters from the store -> API query (page 1 replaces the list, later pages append)
export const fetchOrders = createAsyncThunk(
  'orders/fetch',
  async ({ page = 1 }: { page?: number } = {}, { getState, rejectWithValue }) => {
    const { filters } = (getState() as RootState).orders;
    const params: Record<string, string | number> = { page, page_size: ORDERS_PAGE_SIZE, status: filters.tab };
    if (filters.fulfilment) params.fulfilment = filters.fulfilment;
    if (filters.search.trim()) params.search = filters.search.trim();

    try {
      const response = await api.get<{ orders: Order[]; total: number; page: number; total_pages: number; status_counts: Partial<Record<OrderStatus, number>>; currency: string }>(
        '/api/v1/orders',
        { params }
      );
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load orders'));
    }
  }
);

export const fetchOrderDetail = createAsyncThunk(
  'orders/fetchDetail',
  async (orderId: number, { rejectWithValue }) => {
    try {
      const response = await api.get<OrderDetail>(`/api/v1/orders/${orderId}`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load the order'));
    }
  }
);

// Accept / reject / move along; the server checks the step and the stock (409 says why it can't)
export const changeOrderStatus = createAsyncThunk(
  'orders/changeStatus',
  async ({ orderId, status, reason }: { orderId: number; status: OrderStatus; reason?: string }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post<OrderDetail & { customer_notified: boolean | null }>(`/api/v1/orders/${orderId}/status`, { status, reason: reason ?? null });
      dispatch(fetchOrders({ page: 1 })); // It may leave this tab, and the tab counts change
      return response.data;
    } catch (err) {
      dispatch(fetchOrderDetail(orderId)); // Someone else may have moved it: show its current status and buttons
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update the order'));
    }
  }
);
