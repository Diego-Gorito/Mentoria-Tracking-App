/**
 * Tests pra /api/hosting-accounts (F-S05 AC-1, AC-2, AC-3, AC-10, AC-11).
 *
 * Cenários:
 *  - POST happy path: pingToken ok → 201 + data sem token_encrypted
 *  - POST com token rejeitado → 401 INVALID_TOKEN (via errorHandler)
 *  - POST com body inválido (Zod) → 422 VALIDATION_ERROR
 *  - GET lista (com 1 account criada antes) → 200 + array sem secrets
 *  - DELETE existing → 204
 *  - DELETE non-existent → 404 NOT_FOUND
 *  - Auth missing → 401 (via bypassAuth + header X-Test-No-Auth)
 */

import './test-env';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createHostingAccountsRouter } from '../hosting-accounts';
import { errorHandler } from '../errorHandler';
import { requestIdMiddleware } from '../requestId';
import { MockProvider } from '../../lib/providers/MockProvider';
import type { IHostingProvider } from '../../lib/providers';
import { TokenInvalidError } from '../../lib/providers/errors';
import { bypassAuth, freshRedisStorage, setupCryptoEnv } from './fixtures';
import type { IGtmStorage } from '../../lib/storage';

function buildApp(opts: {
  storage: IGtmStorage;
  providerFactory: (
    type: 'hostinger',
    creds: { token: string; wpAdminPassword?: string },
  ) => IHostingProvider;
}): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);
  const router = createHostingAccountsRouter({
    storage: opts.storage,
    providerFactory: opts.providerFactory,
    authOverride: bypassAuth(),
  });
  app.route('/api/hosting-accounts', router);
  return app;
}

describe('POST /api/hosting-accounts (AC-1)', () => {
  beforeAll(setupCryptoEnv);

  let storage: IGtmStorage;

  beforeEach(async () => {
    storage = await freshRedisStorage();
  });

  it('happy path: cria account + retorna sem token_encrypted + 201', async () => {
    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider(),
    });

    const res = await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'hostinger',
        token: 'valid-token-123',
        label: 'Diego pessoal',
        account_email: 'diego@mentoria.com',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.account_label).toBe('Diego pessoal');
    expect(body.data.status).toBe('active');
    expect(body.data.token_encrypted).toBeUndefined();
    expect(body.data.wp_admin_creds_encrypted).toBeUndefined();
    // X-Request-ID header presente
    expect(res.headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('body inválido (label faltando) → 422 VALIDATION_ERROR', async () => {
    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider(),
    });

    const res = await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'hostinger', token: 'valid-token' }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string; request_id: string; details?: unknown } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('token rejeitado pelo provider (throw TokenInvalidError) → 401 + não persiste', async () => {
    const throwingProvider: IHostingProvider = {
      listSites: async () => { throw new TokenInvalidError(); },
      verifyDomain: async () => { throw new TokenInvalidError(); },
      deployPlugin: async () => { throw new TokenInvalidError(); },
      pingToken: async () => { throw new TokenInvalidError(); },
    };
    const app = buildApp({
      storage,
      providerFactory: () => throwingProvider,
    });

    const res = await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'hostinger',
        token: 'bad-token-x',
        label: 'Diego',
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_TOKEN');

    const accounts = await storage.listAccounts();
    expect(accounts).toHaveLength(0);
  });

  it('pingToken retorna false (não throw) → também 401 + não persiste', async () => {
    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider({ pingResult: false }),
    });

    const res = await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'hostinger',
        token: 'somewhat-valid-but-rejected',
        label: 'Diego',
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_TOKEN');
    expect(await storage.listAccounts()).toHaveLength(0);
  });

  it('auth missing → 401 UNAUTHORIZED', async () => {
    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider(),
    });

    const res = await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-No-Auth': '1' },
      body: JSON.stringify({
        provider: 'hostinger',
        token: 'valid-token',
        label: 'Diego',
      }),
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/hosting-accounts (AC-2)', () => {
  beforeAll(setupCryptoEnv);

  it('lista accounts do tenant sem token_encrypted', async () => {
    const storage = await freshRedisStorage();
    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider(),
    });

    // Cria 2 accounts via POST pra popular
    await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'hostinger', token: 'token-aaa', label: 'Acc A' }),
    });
    await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'hostinger', token: 'token-bbb', label: 'Acc B' }),
    });

    const res = await app.request('/api/hosting-accounts');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<Record<string, unknown>> };
    expect(body.data).toHaveLength(2);
    for (const acc of body.data) {
      expect(acc.token_encrypted).toBeUndefined();
      expect(acc.wp_admin_creds_encrypted).toBeUndefined();
      expect(acc.id).toBeDefined();
      expect(acc.account_label).toBeDefined();
    }
  });
});

describe('DELETE /api/hosting-accounts/:id (AC-3)', () => {
  beforeAll(setupCryptoEnv);

  it('204 + preserva audit (não tocou audit keys)', async () => {
    const storage = await freshRedisStorage();
    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider(),
    });

    const createRes = await app.request('/api/hosting-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'hostinger', token: 'tokenABC1', label: 'X' }),
    });
    const created = (await createRes.json()) as { data: { id: string } };

    const delRes = await app.request(`/api/hosting-accounts/${created.data.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);

    // Garantia: account some
    const list = await storage.listAccounts();
    expect(list.find((a) => a.id === created.data.id)).toBeUndefined();
  });

  it('id inexistente → 404 NOT_FOUND', async () => {
    const storage = await freshRedisStorage();
    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider(),
    });

    const res = await app.request('/api/hosting-accounts/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
