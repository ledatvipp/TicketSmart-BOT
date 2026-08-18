import { defineStore } from 'pinia';
import { AuthAPI } from '../api/endpoints';
import { bindAuth } from '../api/client';
import { disconnectSocket, connectSocket } from '../socket';
import { removeStoredValue } from '../utils/storage';

// Xóa token của phiên bản cũ khỏi storage ngay khi module được load.
for (const key of ['token', 'refreshToken', 'user']) removeStoredValue(key);

let bootstrapPromise = null;

export const useAuth = defineStore('auth', {
  state: () => ({
    token: '', // chỉ giữ trong memory
    user: null,
    initialized: false,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    isAdmin: (state) => state.user?.role === 'ADMIN',
    hasPermission: (state) => (permission) => state.user?.role === 'ADMIN' || Boolean(state.user?.permissions?.[permission]),
  },

  actions: {
    setSession({ token, user }) {
      this.token = token || '';
      if (user) this.user = user;
      if (this.token) connectSocket(this.token);
    },

    async loginWithCode(code, state) {
      const session = await AuthAPI.loginWithCode(code, state);
      this.setSession(session);
      this.initialized = true;
    },

    async loginWithPassword(username, password) {
      const session = await AuthAPI.loginWithPassword(username, password);
      this.setSession(session);
      this.initialized = true;
    },

    async fetchMe() {
      this.user = await AuthAPI.me();
      return this.user;
    },

    async refresh() {
      const session = await AuthAPI.refresh();
      this.setSession(session);
      return session;
    },

    async bootstrap() {
      if (this.initialized) return this.isAuthenticated;
      if (bootstrapPromise) return bootstrapPromise;
      bootstrapPromise = (async () => {
        try {
          await this.refresh();
        } catch {
          this.token = '';
          this.user = null;
          disconnectSocket();
        } finally {
          this.initialized = true;
          bootstrapPromise = null;
        }
        return this.isAuthenticated;
      })();
      return bootstrapPromise;
    },

    clearSession() {
      this.token = '';
      this.user = null;
      disconnectSocket();
    },

    async logout({ redirect = true } = {}) {
      try { await AuthAPI.logout(); } catch { /* local logout still proceeds */ }
      this.clearSession();
      this.initialized = true;
      if (redirect) window.location.assign('/login');
    },

    async logoutAll() {
      try { await AuthAPI.logoutAll(); } finally {
        this.clearSession();
        this.initialized = true;
        window.location.assign('/login');
      }
    },
  },
});

export function initAuthBinding() {
  const store = useAuth();
  bindAuth(store);
}
