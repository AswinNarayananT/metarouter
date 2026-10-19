import axios from 'axios';
import { store } from '@/store';
import { API_BASE_URL } from '@/api/config';

export const api = axios.create({
  baseURL: API_BASE_URL,
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

// One refresh at a time: refresh tokens rotate, so requests that fail together share a single refresh call
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post<{ access_token: string }>('/api/v1/auth/refresh-token')
      .then((response) => {
        const { access_token } = response.data;
        store.dispatch({
          type: 'workspace/setCredentials',
          payload: { access_token, user: store.getState().workspace.user },
        });
        localStorage.setItem('workspace_token', access_token);
        return access_token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Response Interceptor: Workspace 401 handling & token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // A 401 from login/refresh means bad credentials, not an expired session — let the caller handle it
    const isAuthRoute =
      originalRequest.url?.includes('/auth/refresh-token') ||
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;

      try {
        const access_token = await refreshAccessToken();
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