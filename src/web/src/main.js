import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuth, initAuthBinding } from './stores/auth';
import { getStoredValue } from './utils/storage';
import './styles/main.css';
import './styles/dashboard-pro.css';

const savedTheme = getStoredValue('ticket-theme');
const preferredTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
document.documentElement.dataset.theme = savedTheme || preferredTheme;

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Gắn axios interceptor với pinia store sau khi pinia ready
initAuthBinding();

app.mount('#app');
