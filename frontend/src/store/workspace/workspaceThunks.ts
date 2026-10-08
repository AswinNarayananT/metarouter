    import { createAsyncThunk } from '@reduxjs/toolkit';
    import { api } from '@/api/axios';
    import type { LoginCredentials } from '@/types/workspaceTypes';

    // Async Thunk for Tenant / Workspace Login
    export const loginWorkspaceUser = createAsyncThunk(
    'workspace/login',
    async (credentials: LoginCredentials, { rejectWithValue }) => {
        try {
        const response = await api.post('/api/v1/auth/login', credentials);
        const data = response.data;

        // Persist token and user in localStorage
        localStorage.setItem('workspace_token', data.access_token);
        localStorage.setItem('workspace_user', JSON.stringify(data.user));

        return data;
        } catch (err: any) {
        return rejectWithValue(err.response?.data?.detail || 'Invalid login credentials');
        }
    }
    );