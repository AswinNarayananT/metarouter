import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { RootState } from '@/store';
import type { Ticket, TicketActivity, TicketDetail, TicketGroupNode, TicketStatus, TicketType } from '@/types/ticketTypes';

const TICKETS_PAGE_SIZE = 30;

// Current filters from the store -> API query (page 1 replaces the list, later pages append)
export const fetchTickets = createAsyncThunk(
  'tickets/fetch',
  async ({ page = 1 }: { page?: number } = {}, { getState, rejectWithValue }) => {
    const { filters } = (getState() as RootState).tickets;
    const params: Record<string, string | number> = { page, page_size: TICKETS_PAGE_SIZE };
    if (filters.tab === 'mine') params.assigned = 'me';
    else if (filters.tab !== 'all') params.status = filters.tab;
    if (filters.type) params.type = filters.type;
    if (filters.handledBy) params.handled_by = filters.handledBy;
    if (filters.groupId) params.group_id = filters.groupId;
    if (filters.subgroupId) params.subgroup_id = filters.subgroupId;
    if (filters.search.trim()) params.search = filters.search.trim();

    try {
      const response = await api.get<{ tickets: Ticket[]; total: number; page: number; total_pages: number; status_counts: Partial<Record<TicketStatus, number>> }>(
        '/api/v1/tickets/',
        { params }
      );
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load tickets'));
    }
  }
);

export const fetchTicketGroups = createAsyncThunk(
  'tickets/fetchGroups',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<{ groups: TicketGroupNode[] }>('/api/v1/tickets/groups');
      return response.data.groups;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load ticket groups'));
    }
  }
);

export const fetchTicketDetail = createAsyncThunk(
  'tickets/fetchDetail',
  async (ticketId: number, { rejectWithValue }) => {
    try {
      const response = await api.get<TicketDetail>(`/api/v1/tickets/${ticketId}`);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load the ticket'));
    }
  }
);

export interface TicketChanges {
  subject?: string;
  description?: string;
  type?: TicketType;
  group_id?: number | null;
  subgroup_id?: number | null;
  status?: 'open' | 'in_progress' | 'waiting';
}

export const updateTicket = createAsyncThunk(
  'tickets/update',
  async ({ ticketId, changes }: { ticketId: number; changes: TicketChanges }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.patch<Ticket>(`/api/v1/tickets/${ticketId}`, changes);
      dispatch(fetchTicketDetail(ticketId)); // New history lines
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to update the ticket'));
    }
  }
);

export const addTicketNote = createAsyncThunk(
  'tickets/addNote',
  async ({ ticketId, content }: { ticketId: number; content: string }, { rejectWithValue }) => {
    try {
      const response = await api.post<TicketActivity>(`/api/v1/tickets/${ticketId}/notes`, { content });
      return { ticketId, note: response.data };
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to add the note'));
    }
  }
);

export const closeTicket = createAsyncThunk(
  'tickets/close',
  async ({ ticketId, resolution, handBackToAi }: { ticketId: number; resolution: string; handBackToAi: boolean }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.post<Ticket>(`/api/v1/tickets/${ticketId}/close`, { resolution, hand_back_to_ai: handBackToAi });
      dispatch(fetchTicketDetail(ticketId));
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to close the ticket'));
    }
  }
);

// The AI rewrites subject / details / labels in the background; the ticket updates live when it's done
export const relabelTicket = createAsyncThunk(
  'tickets/relabel',
  async (ticketId: number, { rejectWithValue }) => {
    try {
      await api.post(`/api/v1/tickets/${ticketId}/relabel`);
      return ticketId;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to refresh the ticket'));
    }
  }
);

// Assigning the ticket assigns its chat too (one owner for the customer)
export const assignTicket = createAsyncThunk(
  'tickets/assign',
  async ({ ticketId, userId }: { ticketId: number; userId: number | null }, { dispatch, rejectWithValue }) => {
    try {
      const response = await api.patch<Ticket>(`/api/v1/tickets/${ticketId}/assign`, { user_id: userId });
      dispatch(fetchTicketDetail(ticketId));
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to assign the ticket'));
    }
  }
);
