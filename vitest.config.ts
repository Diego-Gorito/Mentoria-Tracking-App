import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vitest config raiz — single config c/ projects (Vitest 2.x workspace style).
// Workers tests rodam em `node` env, frontend em `jsdom` (RTL + @testing-library).
// Histórico: era node-only; estendido em 2026-05-25 (F-S09) pra suportar React tests.

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
