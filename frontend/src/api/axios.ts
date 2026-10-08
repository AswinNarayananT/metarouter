import axios from 'axios';

// Create an Axios instance with base configuration
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT token automatically
api.interceptors.request.use(
  (config) => {
    // Check for super admin token first, fall back to general user token if needed
    const token = localStorage.getItem('super_admin_token') || localStorage.getItem('access_token');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle 401 Unauthorized errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't already retried this request
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Clear local storage tokens
      localStorage.removeItem('super_admin_token');
      localStorage.removeItem('super_admin_user');
      localStorage.removeItem('access_token');

      // Determine if we are in the admin portal or client portal and redirect accordingly
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/admin')) {
        window.location.href = '/admin/login';
      } else {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);