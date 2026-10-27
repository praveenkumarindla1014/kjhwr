import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // In dev, /api is proxied to the FastAPI backend so the browser stays same-origin.
      proxy: {
        '/api': { target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
      },
    },
    build: {
      // Recharts (with its d3 dependencies) is ~520 kB on its own, isolated in the `charts` chunk.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'lucide-react'] },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      css: false,
    },
  };
});
