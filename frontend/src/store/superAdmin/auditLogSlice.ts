import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuditLogItem, AuditLogSummary } from '@/types/auditLogTypes';
import { fetchAuditLogs, exportAuditLogsCsv } from './auditLogThunks';

interface AuditLogState {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: AuditLogSummary | null;
  selectedLog: AuditLogItem | null;
  isLoading: boolean;
  isExporting: boolean;
  error: string | null;
}

const initialState: AuditLogState = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  total_pages: 1,
  summary: null,
  selectedLog: null,
  isLoading: false,
  isExporting: false,
  error: null,
};

const auditLogSlice = createSlice({
  name: 'auditLogs',
  initialState,
  reducers: {
    setSelectedLog: (state, action: PayloadAction<AuditLogItem | null>) => {
      state.selectedLog = action.payload;
    },
    clearAuditLogError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Audit Logs
      .addCase(fetchAuditLogs.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.page_size = action.payload.page_size;
        state.total_pages = action.payload.total_pages;
        state.summary = action.payload.summary;
      })
      .addCase(fetchAuditLogs.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || 'Failed to fetch audit logs';
      })
      // Export CSV
      .addCase(exportAuditLogsCsv.pending, (state) => {
        state.isExporting = true;
      })
      .addCase(exportAuditLogsCsv.fulfilled, (state) => {
        state.isExporting = false;
      })
      .addCase(exportAuditLogsCsv.rejected, (state, action) => {
        state.isExporting = false;
        state.error = action.payload || 'Failed to export audit logs';
      });
  },
});

export const { setSelectedLog, clearAuditLogError } = auditLogSlice.actions;
export default auditLogSlice.reducer;
