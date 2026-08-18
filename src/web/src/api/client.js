import axios from 'axios';

const client = axios.create({
  baseURL: '/',
  timeout: 15000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

let authRef = null;
let refreshPromise = null;

export function bindAuth(store) {
  authRef = store;
}

client.interceptors.request.use((config) => {
  if (authRef?.token && !config.skipAccessToken) {
    config.headers.Authorization = `Bearer ${authRef.token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const code = error.response?.data?.code;
    if (
      error.response?.status === 401
      && code === 'TOKEN_EXPIRED'
      && !original._retry
      && !original.skipAuthRefresh
      && authRef
    ) {
      original._retry = true;
      try {
        refreshPromise ||= authRef.refresh();
        await refreshPromise;
        refreshPromise = null;
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${authRef.token}`;
        return client(original);
      } catch (refreshError) {
        refreshPromise = null;
        authRef.clearSession();
        if (window.location.pathname !== '/login') window.location.assign('/login');
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export default client;
