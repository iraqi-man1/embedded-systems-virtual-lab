import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { evlabDevToolchain } from './tools/vite-plugin-evlab-dev.ts';

// Tauri expects a fixed port in development and static assets in production.
export default defineConfig({
  plugins: [react(), evlabDevToolchain()],
  clearScreen: false,
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/.toolchain/**'] },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
} as never);
