import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['workers/**/__tests__/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
