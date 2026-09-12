/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_BASE_PATH lets the same build serve from "/" (custom host) or
// "/isoline-browser/" (GitHub Pages project site). See .env.example.
export default defineConfig(({ mode }) => ({
  base: process.env['VITE_BASE_PATH'] ?? (mode === 'production' ? '/isoline-browser/' : '/'),
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Set just above the 534 kB main chunk that react-aria-components produced
    // in M2.5, so the warning still fires on the next heavy dependency rather
    // than being silenced. It measures parse cost, not transfer. docs/adr/0010.
    chunkSizeWarningLimit: 600,
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
}));
