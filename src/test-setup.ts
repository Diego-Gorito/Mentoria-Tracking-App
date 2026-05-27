// Vitest setup pra projeto frontend (jsdom env).
// Adiciona matchers do @testing-library/jest-dom (toBeInTheDocument, etc).
// Cleanup automático entre tests (RTL v16 não faz mais auto-cleanup com vitest).

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
