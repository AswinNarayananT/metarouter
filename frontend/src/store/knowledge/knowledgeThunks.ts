import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { KnowledgeDocument } from '@/types/knowledgeTypes';

export const fetchKnowledgeDocuments = createAsyncThunk(
  'knowledge/fetchDocuments',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<{ documents: KnowledgeDocument[]; max_documents: number }>('/api/v1/ai-settings/knowledge');
      return response.data;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to load the knowledge base'));
    }
  }
);

export const uploadKnowledgeDocument = createAsyncThunk(
  'knowledge/uploadDocument',
  async (file: File, { rejectWithValue }) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      // Override the client's JSON default so axios sends multipart with a boundary
      const response = await api.post<{ document: KnowledgeDocument }>('/api/v1/ai-settings/knowledge', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.document;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to upload the PDF'));
    }
  }
);

export const retryKnowledgeDocument = createAsyncThunk(
  'knowledge/retryDocument',
  async (id: number, { rejectWithValue }) => {
    try {
      const response = await api.post<{ document: KnowledgeDocument }>(`/api/v1/ai-settings/knowledge/${id}/retry`);
      return response.data.document;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to process the PDF again'));
    }
  }
);

export const deleteKnowledgeDocument = createAsyncThunk(
  'knowledge/deleteDocument',
  async (id: number, { rejectWithValue }) => {
    try {
      await api.delete(`/api/v1/ai-settings/knowledge/${id}`);
      return id;
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Failed to delete the document'));
    }
  }
);
