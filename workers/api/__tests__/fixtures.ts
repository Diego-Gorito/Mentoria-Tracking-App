/**
 * Fixtures + helpers compartilhados pelos tests de F-S05 endpoints.
 *
 * - `setupCryptoEnv()` — gera keypair libsodium efêmero + seta env vars
 *   (sealEncrypt requer STORAGE_ENCRYPTION_PUBLIC_KEY).
 * - `bypassAuth(authCtx?)` — middleware fake que injeta authCtx no context
 *   pra evitar dependência do Supabase real nos tests.
 * - `MakeRedisStorage()` — constrói RedisGtmStorage com ioredis-mock.
 *
 * NÃO usado em prod. Apenas vitest.
 */

import type { Context, Next } from 'hono';
import RedisMock from 'ioredis-mock';
import { createRequire } from 'module';

import type { AuthContext } from '../middleware';
import { RedisGtmStorage } from '../../lib/storage/RedisGtmStorage';
import type { IGtmStorage } from '../../lib/storage';
import type { TenantId } from '../../lib/storage/types';
import { MENTORIA_TENANT_ID } from '../../lib/constants';

const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers');

let envInitialized = false;

/**
 * Gera keypair libsodium efêmero e seta env vars de encryption.
 * Idempotente: chamadas subsequentes não regeneram.
 */
export async function setupCryptoEnv(): Promise<void> {
  if (envInitialized) return;
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  process.env.STORAGE_ENCRYPTION_PUBLIC_KEY = sodium.to_base64(
    kp.publicKey,
    sodium.base64_variants.ORIGINAL,
  );
  process.env.STORAGE_ENCRYPTION_SECRET_KEY = sodium.to_base64(
    kp.privateKey,
    sodium.base64_variants.ORIGINAL,
  );
  envInitialized = true;
}

/**
 * Default authCtx pra testes — Diego user fake do tenant Mentoria.
 */
export const TEST_AUTH_CTX: AuthContext = {
  userId: '00000000-0000-0000-0000-00000000000a',
  email: 'test@example.com',
  tenantId: MENTORIA_TENANT_ID as unknown as string,
  products: ['tracking'],
  currentProduct: 'tracking',
  accessToken: 'test-jwt-token',
};

export const TEST_TENANT_ID = MENTORIA_TENANT_ID as TenantId;

/**
 * Middleware factory que bypassa auth real e injeta `authCtx` no context.
 *
 * Uso: passar como `authOverride` no createXxxRouter().
 *
 * Se `header X-Skip-Auth=1` ausente, simula resposta 401 do middleware
 * real (pra testar AC-11).
 */
export function bypassAuth(
  authCtx: AuthContext = TEST_AUTH_CTX,
): (c: Context, n: Next) => Promise<Response | void> {
  return async (c, next) => {
    // Permite testar "no auth" caso explícito: header X-Test-No-Auth ⇒ 401.
    if (c.req.header('X-Test-No-Auth') === '1') {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária', request_id: '' } }, 401);
    }
    c.set('authCtx', authCtx);
    await next();
  };
}

/**
 * Cria RedisGtmStorage com ioredis-mock.
 *
 * ATENÇÃO: ioredis-mock v6+ COMPARTILHA state entre instâncias quando
 * host:port batem (default `localhost:6379`). Pra evitar bleed entre
 * tests, retornamos também o client + um helper `flush()` que cada
 * test deve chamar em beforeEach. Veja README do ioredis-mock §"v5→v6".
 */
export function makeRedisStorage(): {
  storage: IGtmStorage;
  flush: () => Promise<void>;
  client: unknown;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new RedisMock() as any;
  const storage = new RedisGtmStorage({ client });
  return {
    storage,
    client,
    flush: async () => {
      await client.flushall();
    },
  };
}

/**
 * Legacy helper — cria storage + flush imediato. Útil pra tests onde
 * `beforeEach` cria storage e quer começar limpo.
 */
export async function freshRedisStorage(): Promise<IGtmStorage> {
  const { storage, flush } = makeRedisStorage();
  await flush();
  return storage;
}
