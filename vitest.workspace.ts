// Vitest workspace — F-S09 (2026-05-25).
// 2 projects: workers (node) + frontend (jsdom).
// Roda `npx vitest run` pra ambos; `--project workers` ou `--project frontend` pra filtrar.

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'workers',
      include: ['workers/**/__tests__/**/*.test.ts'],
      environment: 'node',
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'frontend',
      include: ['src/**/__tests__/**/*.test.tsx'],
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
    },
  },
]);
