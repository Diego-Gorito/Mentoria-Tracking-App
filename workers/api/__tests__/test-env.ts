/**
 * test-env.ts — side-effect import que seta env vars dummy de Supabase ANTES
 * que `workers/api/db.ts` seja avaliado (módulo top-level throwa se faltarem).
 *
 * Importar SEMPRE como PRIMEIRA linha de cada test file de F-S05:
 *   import './test-env';
 *
 * Esse pattern evita modificar vitest.config.ts (escopo declarado fora do
 * meu domínio). Quando F-S06+ rodar mais tests, considera adicionar
 * `setupFiles: ['./workers/api/__tests__/test-env.ts']` ao vitest.config.ts
 * (decisão do owner do config).
 */

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

// Empty export pra garantir que este arquivo é tratado como módulo
// (e não como script global) — TS isolatedModules exige.
export {};
