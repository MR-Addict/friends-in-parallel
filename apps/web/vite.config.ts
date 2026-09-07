import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.PORT || 4500}`,
      '/uploads': `http://127.0.0.1:${process.env.PORT || 4500}`,
    },
  },
});
