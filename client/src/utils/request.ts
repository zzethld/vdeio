import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
});

request.interceptors.request.use(
  (config) => {
    // In Electron renderer, we read from Pinia store (backed by localStorage)
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

request.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const authStore = useAuthStore();
      const refreshed = await authStore.refreshAccessToken();

      if (refreshed) {
        originalRequest.headers.Authorization = `Bearer ${authStore.accessToken}`;
        return request(originalRequest);
      }

      // Refresh failed, redirect to login
      authStore.logout();
    }

    return Promise.reject(error);
  },
);

export default request;
