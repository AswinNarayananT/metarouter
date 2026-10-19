import axios from 'axios';
import { store } from '@/store';
import { API_BASE_URL } from '@/api/config';

export const superAdminApi = axios.create({
  baseURL: API_BASE_URL,
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
    // A 401 from login means bad credentials — don't reload the page and wipe the error
    const isLoginRoute = error.config?.url?.includes('/superadmin/login') || error.config?.url?.includes('/superadmin/logout');
    if (error.response?.status === 401 && !isLoginRoute) {
      store.dispatch({ type: 'superAdmin/logoutSuperAdmin' }); // Or equivalent logout action
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);