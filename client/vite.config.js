import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Localhost only (SRS C-06). /api is proxied to the Express server so the
// browser sees one origin in development and CORS never enters the picture.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
