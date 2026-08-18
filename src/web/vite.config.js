import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// API + Socket.IO proxy → Express server (PORT)
const API_TARGET = process.env.API_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, changeOrigin: true, ws: true },
      '/auth': { target: API_TARGET, changeOrigin: true },
    },
  },
});
