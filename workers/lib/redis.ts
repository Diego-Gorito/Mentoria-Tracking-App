/**
 * Redis singleton client — lazy-init ioredis connection with REDIS_URL env.
 *
 * Centraliza criação de conexão para evitar múltiplas conexões espalhadas
 * pelo codebase (cache Metabase, dedup tracking, storage GTM).
 *
 * Default URL: `redis://redis:6379` (Easypanel internal hostname).
 *
 * Para testes, prefira injetar uma instância (ex.: `ioredis-mock`)
 * diretamente em `new RedisGtmStorage({ client })` ao invés de usar este singleton.
 */

import Redis, { type Redis as RedisClient, type RedisOptions } from 'ioredis';

let cachedClient: RedisClient | null = null;

/**
 * Retorna a instância singleton do client Redis. Cria sob demanda na 1ª chamada.
 *
 * @param overrides — opções extras pra mesclar (uso em testes ou setup custom).
 */
export function getRedis(overrides?: RedisOptions): RedisClient {
  if (cachedClient) return cachedClient;

  const url = process.env.REDIS_URL ?? 'redis://redis:6379';
  cachedClient = new Redis(url, {
    // Mantém comportamento defensivo: não trava boot da API se Redis tá lento.
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    ...overrides,
  });

  // Evita que connection errors em background derrubem o processo Node.
  // Logs caem em stderr; observabilidade real fica a cargo do helper de log
  // do caller (não escopo desta camada de storage).
  cachedClient.on('error', (err: Error) => {

    console.error('[redis] connection error:', err.message);
  });

  return cachedClient;
}

/**
 * Fecha a conexão singleton (uso em shutdown gracioso ou hot-reload de testes).
 */
export async function closeRedis(): Promise<void> {
  if (cachedClient) {
    await cachedClient.quit();
    cachedClient = null;
  }
}
