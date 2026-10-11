import axios from 'axios';
import { store } from '@/store';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request Interceptor: Pull ONLY workspace token
api.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state.workspace.token;
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Workspace 401 handling & token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isRefreshRoute = originalRequest.url?.includes('/auth/refresh-token');

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRoute) {
      originalRequest._retry = true;

      try {
        const response = await api.post('/api/v1/auth/refresh-token');
        const { access_token } = response.data;

        store.dispatch({ 
          type: 'workspace/setCredentials', 
          payload: { access_token, user: store.getState().workspace.user } 
        });
        localStorage.setItem('workspace_token', access_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        store.dispatch({ type: 'workspace/logoutWorkspace' });
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);