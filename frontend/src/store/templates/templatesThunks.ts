import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { MessageTemplate, TemplateFormValues } from '@/types/templateTypes';

export const fetchMessageTemplates = createAsyncThunk(
  'templates/fetch',
  async (phoneNumberId: string, { rejectWithValue }) => {
    try {
      const response = await api.get<{ templates: MessageTemplate[] }>('/api/v1/templates', {
        params: { phone_number_id: phoneNumberId },
      });
      return response.data.templates;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load templates'));
    }
  }
);

export const createMessageTemplate = createAsyncThunk(
  'templates/create',
  async ({ phoneNumberId, values }: { phoneNumberId: string; values: TemplateFormValues }, { rejectWithValue }) => {
    try {
      const response = await api.post<{ name: string; language: string }>('/api/v1/templates', {
        ...values,
        phone_number_id: phoneNumberId,
      });
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to send the template to Meta'));
    }
  }
);

export const deleteMessageTemplate = createAsyncThunk(
  'templates/delete',
  async ({ phoneNumberId, name }: { phoneNumberId: string; name: string }, { rejectWithValue }) => {
    try {
      await api.delete('/api/v1/templates', { params: { phone_number_id: phoneNumberId, name } });
      return name;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to delete the template'));
    }
  }
);
