import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    // In development the API runs on port 3000.
    proxy: { '/api': process.env.API_URL || 'http://localhost:3000' },
  },
});
