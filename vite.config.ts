/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_BASE_PATH lets the same build serve from "/" (custom host) or
// "/isoline-browser/" (GitHub Pages project site). See .env.example.
export default defineConfig(({ mode }) => ({
  base: process.env['VITE_BASE_PATH'] ?? (mode === 'production' ? '/isoline-browser/' : '/'),
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
