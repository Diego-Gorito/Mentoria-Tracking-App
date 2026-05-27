/**
 * Tests pra /api/installations/:id/events (F-S12 AC-1 a AC-4 + AC-7) +
 * worker publish events (F-S12 AC-2).
 *
 * Cenários:
 *  - SSE endpoint retorna Content-Type text/event-stream
 *  - Emite eventos do Redis LIST → response chunks contém `data: {json}`
 *  - Heartbeat ping após timeout sem eventos
 *  - Step terminal (`installed | failed`) encerra stream
 *  - Auth missing → 401 (X-Test-No-Auth header)
 *  - Installation inexistente → 404
 *  - Worker deployJob publica events em ordem correta
 *
 * Notas técnicas
 * --------------
 *  - ioredis-mock NÃO implementa `BRPOP` (confirmado em
 *    `node_modules/ioredis-mock/lib/index.js` — só define `rpop`/`lpop`/
 *    `brpoplpush`). Por isso injetamos `popEvent` custom que combina `rpop`
 *    + sleep loop até o timeout. Em prod, default `BRPOP` é usado.
 *  - `heartbeatMs` parametrizado pra acelerar tests (default 15s → tests 100ms).
 *  - Stream reading: `app.request` retorna `Response` com `body` =
 *    `ReadableStream`. Lemos via `.getReader().read()` e juntamos chunks até
 *    encontrarmos evento terminal OR atingirmos timeout do test.
 */

import './test-env';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Redis as RedisClient } from 'ioredis';

import { createInstallationsRouter } from '../installations';
import { errorHandler } from '../errorHandler';
import { requestIdMiddleware } from '../requestId';
import { MockProvider } from '../../lib/providers/MockProvider';
import { sealEncrypt } from '../../lib/storage/crypto';
import {
  bypassAuth,
  freshRedisStorage,
  makeRedisStorage,
  setupCryptoEnv,
  TEST_TENANT_ID,
} from './fixtures';
import type { IGtmStorage } from '../../lib/storage';
import type {
  AccountId,
  GtmInstallation,
  InstallationId,
} from '../../lib/storage/types';
import type { DeployJobDeps } from '../deployJob';
import type { PopEventFn, SseEvent } from '../../lib/sseBus';
import { publishEvent, sseEventsKey } from '../../lib/sseBus';
import { deployJob } from '../deployJob';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function seedAccount(storage: IGtmStorage): Promise<AccountId> {
  const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY!;
  const tokenEncrypted = await sealEncrypt('mock-token', pub);
  const acc = await storage.createAccount({
    tenant_id: TEST_TENANT_ID,
    provider: 'hostinger',
    account_label: 'Diego',
    token_encrypted: tokenEncrypted,
    status: 'active',
  });
  return acc.id;
}

async function seedInstallation(
  storage: IGtmStorage,
  accountId: AccountId,
  domain = 'zerohum.com.br',
): Promise<GtmInstallation> {
  return storage.createInstallation({
    tenant_id: TEST_TENANT_ID,
    hosting_account_id: accountId,
    site_domain: domain,
    brand_slug: 'zerohum',
    gtm_container_id: 'GTM-WVWQVMP',
    plugin_version: 'gtm4wp-1.18+bootstrap-v1',
    status: 'draft',
    attempt_count: 0,
  });
}

/**
 * Adapter pra ioredis-mock: emula BRPOP via rpop + sleep loop curto.
 *
 * Loop interno checa rpop a cada 25ms até atingir `timeoutMs` (resolução
 * sub-segundo, necessária pra testar heartbeat sem suite lenta). Retorna
 * `null` em timeout (heartbeat).
 *
 * Mantém compatibilidade com signature `PopEventFn` (timeoutMs em ms).
 */
function rpopPolling(): PopEventFn {
  return async (redis, key, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (await (redis as any).rpop(key)) as string | null;
      if (val !== null) return val;
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
}

/**
 * Lê o body SSE em chunks até atingir um terminal (data com step terminal)
 * OR um maxBytes/timeout — retorna texto agregado. Necessário porque
 * `app.request` resolve `Response` com `ReadableStream` aberto enquanto o
 * server escreve.
 */
async function readSseUntil(
  res: Response,
  predicate: (acc: string) => boolean,
  timeoutMs = 3000,
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) acc += decoder.decode(value, { stream: true });
    if (predicate(acc)) break;
  }
  // Best-effort cancel pra liberar reader.
  try {
    await reader.cancel();
  } catch {
    // ignore
  }
  return acc;
}

interface AppOpts {
  storage: IGtmStorage;
  redisClient: RedisClient;
  popEvent?: PopEventFn;
  heartbeatMs?: number;
  scheduleDeploy?: (id: InstallationId, deps: DeployJobDeps) => void | Promise<void>;
  validate?: DeployJobDeps['validate'];
}

function buildApp(opts: AppOpts): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);
  const router = createInstallationsRouter({
    storage: opts.storage,
    providerFactory: () => new MockProvider(),
    authOverride: bypassAuth(),
    redisClient: opts.redisClient,
    popEvent: opts.popEvent ?? rpopPolling(),
    heartbeatMs: opts.heartbeatMs ?? 200,
    scheduleDeploy: opts.scheduleDeploy,
    validate: opts.validate,
  });
  app.route('/api/installations', router);
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint SSE (AC-1, AC-3, AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/installations/:id/events (F-S12 AC-1+AC-3+AC-4)', () => {
  beforeAll(setupCryptoEnv);

  it('retorna Content-Type: text/event-stream + Cache-Control no-cache (AC-1)', async () => {
    const { storage, client: redis } = makeRedisStorage();
    await (redis as RedisClient).flushall();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // Pre-popula evento terminal pra fechar o stream rápido.
    await publishEvent(redis as RedisClient, inst.id, {
      step: 'installed',
      status: 'done',
    });

    const app = buildApp({ storage, redisClient: redis as RedisClient });
    const res = await app.request(`/api/installations/${inst.id}/events`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    // streamSSE também seta Connection keep-alive + Transfer-Encoding chunked
    expect(res.headers.get('Connection')).toBe('keep-alive');
    // Drena pra evitar reader leak.
    await readSseUntil(res, () => true, 500);
  });

  it('emite eventos do Redis LIST e fecha stream em step terminal (AC-3)', async () => {
    const { storage, client: redis } = makeRedisStorage();
    await (redis as RedisClient).flushall();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // Pre-popula 3 eventos — ordem FIFO esperada: upload_started → upload_complete → installed.
    await publishEvent(redis as RedisClient, inst.id, {
      step: 'upload_started',
      status: 'in_progress',
    });
    await publishEvent(redis as RedisClient, inst.id, {
      step: 'upload_complete',
      status: 'done',
      timing_ms: 1234,
    });
    await publishEvent(redis as RedisClient, inst.id, {
      step: 'installed',
      status: 'done',
      timing_ms: 5678,
    });

    const app = buildApp({ storage, redisClient: redis as RedisClient });
    const res = await app.request(`/api/installations/${inst.id}/events`);

    expect(res.status).toBe(200);

    // Lê até encontrar evento installed (terminal).
    const body = await readSseUntil(
      res,
      (acc) => acc.includes('"step":"installed"'),
    );

    // FIFO: upload_started antes de upload_complete antes de installed.
    const idxStart = body.indexOf('upload_started');
    const idxComplete = body.indexOf('upload_complete');
    const idxInstalled = body.indexOf('installed');
    expect(idxStart).toBeGreaterThanOrEqual(0);
    expect(idxComplete).toBeGreaterThan(idxStart);
    expect(idxInstalled).toBeGreaterThan(idxComplete);

    // Formato SSE: cada payload prefixado com `data: ` (helper hono).
    expect(body).toMatch(/data: \{"step":"upload_started"/);
    expect(body).toMatch(/data: \{"step":"upload_complete".*"timing_ms":1234/);
    expect(body).toMatch(/data: \{"step":"installed"/);
  });

  it('emite heartbeat ": ping" após timeout sem eventos (AC-4)', async () => {
    const { storage, client: redis } = makeRedisStorage();
    await (redis as RedisClient).flushall();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // Sem pre-popular: força timeout do popEvent → heartbeat.
    // Após heartbeat, publicamos um evento terminal pra fechar.
    setTimeout(() => {
      void publishEvent(redis as RedisClient, inst.id, {
        step: 'installed',
        status: 'done',
      });
    }, 250);

    const app = buildApp({
      storage,
      redisClient: redis as RedisClient,
      // heartbeatMs muito baixo pra primeiro tick ser timeout (< 250ms).
      heartbeatMs: 100,
    });
    const res = await app.request(`/api/installations/${inst.id}/events`);

    const body = await readSseUntil(
      res,
      (acc) => acc.includes('"step":"installed"'),
      4000,
    );

    // Comment-line SSE `: ping` precede o evento (heartbeat tick).
    expect(body).toMatch(/: ping/);
    expect(body).toMatch(/data: \{"step":"installed"/);
  });

  it('fecha stream em step "failed" (terminal)', async () => {
    const { storage, client: redis } = makeRedisStorage();
    await (redis as RedisClient).flushall();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    await publishEvent(redis as RedisClient, inst.id, {
      step: 'upload_failed',
      status: 'failed',
      error: 'mocked failure',
    });
    await publishEvent(redis as RedisClient, inst.id, {
      step: 'failed',
      status: 'failed',
      error: 'mocked failure',
    });

    const app = buildApp({ storage, redisClient: redis as RedisClient });
    const res = await app.request(`/api/installations/${inst.id}/events`);

    const body = await readSseUntil(res, (acc) =>
      acc.includes('"step":"failed"'),
    );
    expect(body).toMatch(/data: \{"step":"upload_failed"/);
    expect(body).toMatch(/data: \{"step":"failed"/);
    expect(body).toMatch(/"error":"mocked failure"/);
  });

  it('auth missing → 401', async () => {
    const { storage, client: redis } = makeRedisStorage();
    await (redis as RedisClient).flushall();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    const app = buildApp({ storage, redisClient: redis as RedisClient });
    const res = await app.request(`/api/installations/${inst.id}/events`, {
      headers: { 'X-Test-No-Auth': '1' },
    });
    expect(res.status).toBe(401);
  });

  it('installation inexistente → 404', async () => {
    const { storage, client: redis } = makeRedisStorage();
    await (redis as RedisClient).flushall();
    const app = buildApp({ storage, redisClient: redis as RedisClient });

    const res = await app.request(
      '/api/installations/00000000-0000-0000-0000-000000000000/events',
    );
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Worker publish (AC-2)
// ─────────────────────────────────────────────────────────────────────────────

describe('deployJob publica events em Redis LIST (F-S12 AC-2)', () => {
  beforeAll(setupCryptoEnv);

  it('happy path: publica upload_started → upload_complete → installed em ordem', async () => {
    // Reuse o mesmo RedisMock client em storage + redisClient pra evitar
    // bleed entre instâncias (ioredis-mock v6+ compartilha state por host:port,
    // mas isso é frágil; injetar o mesmo client é mais robusto).
    const { storage, client, flush } = makeRedisStorage();
    await flush();
    const redis = client as RedisClient;

    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // Adquire lock (deployJob assume já adquirido pelo POST /deploy).
    await storage.acquireLock(inst.id, 60);

    await deployJob(inst.id, {
      storage,
      getProvider: async () => new MockProvider({ ownedDomains: ['zerohum.com.br'] }),
      validate: async () => ({
        passed: true,
        stage: 'full',
        details: {
          containerMatch: true,
          expectedMatch: true,
          datalayerMatch: true,
          expectedContainerId: inst.gtm_container_id,
        },
      }),
      redisClient: redis,
    });

    // LRANGE retorna head→tail; LPUSH adicionou em ordem reversa.
    // Pegar todos e reverter pra ordem cronológica (FIFO igual ao BRPOP).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await (redis as any).lrange(sseEventsKey(inst.id), 0, -1)) as string[];
    const events = [...raw].reverse().map((s) => JSON.parse(s) as SseEvent);

    const steps = events.map((e) => e.step);
    // Ordem FIFO esperada do happy path.
    expect(steps).toEqual([
      'upload_started',
      'upload_complete',
      'activation_started',
      'validation_started',
      'validation_passed',
      'installed',
    ]);

    // upload_complete e validation_passed têm timing_ms.
    const uploadComplete = events.find((e) => e.step === 'upload_complete')!;
    expect(typeof uploadComplete.timing_ms).toBe('number');
    expect(uploadComplete.status).toBe('done');

    const installed = events.find((e) => e.step === 'installed')!;
    expect(installed.status).toBe('done');
    expect(typeof installed.timing_ms).toBe('number');

    // TTL setado (F-S12 AC-2: EXPIRE 300s).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ttl = await (redis as any).ttl(sseEventsKey(inst.id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('falha no validate publica validation_failed + failed terminal', async () => {
    const { storage, client, flush } = makeRedisStorage();
    await flush();
    const redis = client as RedisClient;

    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    await storage.acquireLock(inst.id, 60);

    await deployJob(inst.id, {
      storage,
      getProvider: async () => new MockProvider({ ownedDomains: ['zerohum.com.br'] }),
      validate: async () => ({
        passed: false,
        stage: 'head',
        details: {
          containerMatch: false,
          expectedMatch: false,
          datalayerMatch: false,
          expectedContainerId: inst.gtm_container_id,
        },
      }),
      redisClient: redis,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await (redis as any).lrange(sseEventsKey(inst.id), 0, -1)) as string[];
    const events = [...raw].reverse().map((s) => JSON.parse(s) as SseEvent);
    const steps = events.map((e) => e.step);

    // validation_failed + terminal `failed` presentes em ordem.
    expect(steps).toContain('validation_failed');
    expect(steps[steps.length - 1]).toBe('failed');
  });

  it('worker SEM redisClient: pipeline funciona normalmente (no-op publish)', async () => {
    // Garante que tests legacy de F-S05 (sem redisClient) continuam verdes.
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    await storage.acquireLock(inst.id, 60);

    await expect(
      deployJob(inst.id, {
        storage,
        getProvider: async () => new MockProvider({ ownedDomains: ['zerohum.com.br'] }),
        validate: async () => ({
          passed: true,
          stage: 'full',
          details: {
            containerMatch: true,
            expectedMatch: true,
            datalayerMatch: true,
            expectedContainerId: inst.gtm_container_id,
          },
        }),
      }),
    ).resolves.toBeUndefined();

    // Installation transitou pra `installed` mesmo sem Redis pub.
    const after = await storage.getInstallation(inst.id);
    expect(after?.status).toBe('installed');
  });

  it('publishEvent falha → swallow + log (não bloqueia pipeline)', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // Mock redis com multi/lpush throwing
    const brokenRedis = {
      multi: () => ({
        lpush: () => {
          throw new Error('redis_down');
        },
        expire: () => undefined,
        exec: async () => undefined,
      }),
      // não-usado em publishEvent direto:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as RedisClient;

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await storage.acquireLock(inst.id, 60);
    await deployJob(inst.id, {
      storage,
      getProvider: async () => new MockProvider({ ownedDomains: ['zerohum.com.br'] }),
      validate: async () => ({
        passed: true,
        stage: 'full',
        details: {
          containerMatch: true,
          expectedMatch: true,
          datalayerMatch: true,
          expectedContainerId: inst.gtm_container_id,
        },
      }),
      redisClient: brokenRedis,
    });

    // Apesar dos publishes falharem, status final installed gravou no storage.
    const after = await storage.getInstallation(inst.id);
    expect(after?.status).toBe('installed');

    // Log de erro emitido pelo publishEvent.
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
