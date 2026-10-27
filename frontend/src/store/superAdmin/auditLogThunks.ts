import { createAsyncThunk } from '@reduxjs/toolkit';
import { superAdminApi } from '@/api/superAdminApi';
import { getApiErrorMessage } from '@/api/errors';
import type {
  FetchAuditLogsParams,
  PaginatedAuditLogsResponse,
} from '@/types/auditLogTypes';

export const fetchAuditLogs = createAsyncThunk<
  PaginatedAuditLogsResponse,
  FetchAuditLogsParams | undefined,
  { rejectValue: string }
>('auditLogs/fetchAuditLogs', async (params, { rejectWithValue }) => {
  try {
    const response = await superAdminApi.get<PaginatedAuditLogsResponse>(
      '/api/v1/superadmin/audit-logs',
      {
        params: {
          page: params?.page ?? 1,
          page_size: params?.page_size ?? 20,
          search: params?.search?.trim() || undefined,
          category: params?.category && params.category !== 'all' ? params.category : undefined,
          status: params?.status && params.status !== 'all' ? params.status : undefined,
        },
      },
    );
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Failed to fetch audit logs'));
  }
});

export const exportAuditLogsCsv = createAsyncThunk<
  void,
  FetchAuditLogsParams | undefined,
  { rejectValue: string }
>('auditLogs/exportCsv', async (params, { rejectWithValue }) => {
  try {
    const response = await superAdminApi.get('/api/v1/superadmin/audit-logs/export', {
      params: {
        search: params?.search?.trim() || undefined,
        category: params?.category && params.category !== 'all' ? params.category : undefined,
        status: params?.status && params.status !== 'all' ? params.status : undefined,
      },
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Failed to export audit logs CSV'));
  }
});
