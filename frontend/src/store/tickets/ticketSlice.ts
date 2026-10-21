import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Ticket, TicketFilters, TicketState } from '@/types/ticketTypes';
import { addTicketNote, assignTicket, closeTicket, fetchTicketDetail, fetchTicketGroups, fetchTickets, relabelTicket, updateTicket } from './ticketThunks';

const initialState: TicketState = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 1,
  statusCounts: {},
  filters: { tab: 'active', type: '', handledBy: '', groupId: null, subgroupId: null, search: '' },
  isLoading: false,
  loadError: null,
  groups: [],
  selectedId: null,
  detail: null,
  isLoadingDetail: false,
  detailError: null,
  savingId: null,
  actionError: null,
  relabelingId: null,
};

const ticketSlice = createSlice({
  name: 'tickets',
  initialState,
  reducers: {
    setTicketFilters: (state, action: PayloadAction<Partial<TicketFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    selectTicket: (state, action: PayloadAction<number | null>) => {
      state.selectedId = action.payload;
      state.actionError = null;
      if (action.payload === null) state.detail = null;
    },
    // ticket.updated event: refresh the row (and the open details) if we have it
    ticketReceived: (state, action: PayloadAction<Ticket>) => {
      const index = state.items.findIndex((t) => t.id === action.payload.id);
      if (index >= 0) state.items[index] = action.payload;
      if (state.detail?.ticket.id === action.payload.id) state.detail.ticket = action.payload;
      if (state.relabelingId === action.payload.id) state.relabelingId = null; // The AI finished re-filing it
    },
    clearTicketActionError: (state) => {
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTickets.pending, (state) => {
        state.isLoading = true;
        state.loadError = null;
      })
      .addCase(fetchTickets.fulfilled, (state, action) => {
        state.isLoading = false;
        const { tickets, total, page, total_pages, status_counts } = action.payload;
        state.items = page === 1 ? tickets : [...state.items, ...tickets.filter((t) => !state.items.some((i) => i.id === t.id))];
        state.total = total;
        state.page = page;
        state.totalPages = total_pages;
        state.statusCounts = status_counts;
      })
      .addCase(fetchTickets.rejected, (state, action) => {
        state.isLoading = false;
        state.loadError = action.payload as string;
      })

      .addCase(fetchTicketGroups.fulfilled, (state, action) => {
        state.groups = action.payload;
      })

      .addCase(fetchTicketDetail.pending, (state) => {
        state.isLoadingDetail = true;
        state.detailError = null;
      })
      .addCase(fetchTicketDetail.fulfilled, (state, action) => {
        state.isLoadingDetail = false;
        // Ignore a slow response for a ticket that's no longer open in the panel
        if (action.payload.ticket.id === state.selectedId) state.detail = action.payload;
      })
      .addCase(fetchTicketDetail.rejected, (state, action) => {
        state.isLoadingDetail = false;
        state.detailError = action.payload as string;
      })

      .addCase(addTicketNote.fulfilled, (state, action) => {
        state.savingId = null;
        if (state.detail?.ticket.id === action.payload.ticketId) state.detail.activities.push(action.payload.note);
      })
      .addCase(relabelTicket.pending, (state, action) => {
        state.relabelingId = action.meta.arg;
        state.actionError = null;
      })
      .addCase(relabelTicket.rejected, (state, action) => {
        state.relabelingId = null;
        state.actionError = action.payload as string;
      })

      .addMatcher(
        (action) => [updateTicket.pending.type, closeTicket.pending.type, assignTicket.pending.type, addTicketNote.pending.type].includes(action.type),
        (state, action: PayloadAction<unknown, string, { arg: { ticketId: number } }>) => {
          state.savingId = action.meta.arg.ticketId;
          state.actionError = null;
        }
      )
      .addMatcher(
        (action) => [updateTicket.fulfilled.type, closeTicket.fulfilled.type, assignTicket.fulfilled.type].includes(action.type),
        (state, action: PayloadAction<Ticket>) => {
          state.savingId = null;
          const index = state.items.findIndex((t) => t.id === action.payload.id);
          if (index >= 0) state.items[index] = action.payload;
          if (state.detail?.ticket.id === action.payload.id) state.detail.ticket = action.payload;
        }
      )
      .addMatcher(
        (action) => [updateTicket.rejected.type, closeTicket.rejected.type, assignTicket.rejected.type, addTicketNote.rejected.type].includes(action.type),
        (state, action: PayloadAction<unknown>) => {
          state.savingId = null;
          state.actionError = action.payload as string;
        }
      )
      // Logged out: never show one user's tickets to the next one
      .addMatcher((action) => action.type === 'workspace/logoutWorkspace', () => initialState);
  },
});

export const { setTicketFilters, selectTicket, ticketReceived, clearTicketActionError } = ticketSlice.actions;
export default ticketSlice.reducer;
