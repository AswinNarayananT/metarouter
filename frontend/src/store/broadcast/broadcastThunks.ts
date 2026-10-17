import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type {
  BroadcastDetail,
  BroadcastFormValues,
  BroadcastPreview,
  BroadcastSummary,
  BroadcastTemplate,
  Paginated,
  WhatsAppNumberSummary,
} from '@/types/broadcastTypes';

// Builds the multipart body shared by preview and create
function toFormData(values: BroadcastFormValues): FormData {
  const [templateName, templateLanguage] = values.template_key.split('::');
  const formData = new FormData();
  formData.append('phone_number_id', values.phone_number_id);
  formData.append('template_name', templateName);
  formData.append('template_language', templateLanguage);
  formData.append('variables', JSON.stringify(values.variables.map((v) => v.trim())));
  formData.append('use_contact_name', String(values.use_contact_name));
  if (values.audience_source === 'contacts' && values.file) {
    formData.append('file', values.file);
    formData.append('consent_confirmed', String(values.consent_confirmed));
  }
  return formData;
}

// Override the client's JSON default so axios sends multipart with a boundary
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

export const fetchWhatsAppNumbers = createAsyncThunk(
  'broadcast/fetchWhatsAppNumbers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<{ numbers: WhatsAppNumberSummary[] }>('/api/v1/channels/whatsapp/numbers');
      return response.data.numbers;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load WhatsApp numbers'));
    }
  }
);

export const fetchTemplates = createAsyncThunk(
  'broadcast/fetchTemplates',
  async (phoneNumberId: string, { rejectWithValue }) => {
    try {
      const response = await api.get<{ templates: BroadcastTemplate[] }>('/api/v1/broadcasts/templates', {
        params: { phone_number_id: phoneNumberId },
      });
      return response.data.templates;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load templates'));
    }
  }
);

export const previewBroadcast = createAsyncThunk(
  'broadcast/preview',
  async (values: BroadcastFormValues, { rejectWithValue }) => {
    try {
      const response = await api.post<BroadcastPreview>('/api/v1/broadcasts/preview', toFormData(values), MULTIPART);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to check the audience'));
    }
  }
);

export const createBroadcast = createAsyncThunk(
  'broadcast/create',
  async (values: BroadcastFormValues, { rejectWithValue }) => {
    try {
      const response = await api.post<{ id: number; message: string }>('/api/v1/broadcasts', toFormData(values), MULTIPART);
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to send the broadcast'));
    }
  }
);

export const fetchBroadcasts = createAsyncThunk(
  'broadcast/fetchList',
  async (page: number = 1, { rejectWithValue }) => {
    try {
      const response = await api.get<Paginated<BroadcastSummary>>('/api/v1/broadcasts', {
        params: { page, page_size: 10 },
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load broadcasts'));
    }
  }
);

export const fetchBroadcastDetail = createAsyncThunk(
  'broadcast/fetchDetail',
  async ({ id, page = 1 }: { id: number; page?: number }, { rejectWithValue }) => {
    try {
      const response = await api.get<BroadcastDetail>(`/api/v1/broadcasts/${id}`, {
        params: { page, page_size: 25 },
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load the broadcast'));
    }
  }
);
