import axios from 'axios';
import { store } from '@/store';

export const superAdminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request Interceptor: Pull ONLY the super admin token from Redux
superAdminApi.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state.superAdmin.token;
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401s for Super Admin separately
superAdminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      store.dispatch({ type: 'superAdmin/logoutSuperAdmin' }); // Or equivalent logout action
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);