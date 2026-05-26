/**
 * Tests pra /api/installations/* (F-S05 AC-5 a AC-9).
 *
 * Cenários:
 *  - POST create: happy path → 201 + container resolvido por brand_slug
 *  - POST create: brand_slug inválido (Zod) → 422
 *  - POST create: account inexistente → 404
 *  - POST /:id/deploy: happy → 202 + job_id/sse_url
 *  - POST /:id/deploy: lock já adquirido → 409 DEPLOY_IN_PROGRESS
 *  - POST /:id/revalidate: stub passes → 200
 *  - GET /:id: retorna installation + Cache-Control no-store
 *  - DELETE /:id: soft delete + X-Onda header
 */

import './test-env';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createInstallationsRouter } from '../installations';
import { errorHandler } from '../errorHandler';
import { requestIdMiddleware } from '../requestId';
import { MockProvider } from '../../lib/providers/MockProvider';
import type { IHostingProvider } from '../../lib/providers';
import { sealEncrypt } from '../../lib/storage/crypto';
import {
  bypassAuth,
  freshRedisStorage,
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

function buildApp(opts: {
  storage: IGtmStorage;
  providerFactory?: (
    type: 'hostinger',
    creds: { token: string; wpAdminPassword?: string },
  ) => IHostingProvider;
  scheduleDeploy?: (id: InstallationId, deps: DeployJobDeps) => void | Promise<void>;
}): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);
  const router = createInstallationsRouter({
    storage: opts.storage,
    providerFactory: opts.providerFactory ?? (() => new MockProvider()),
    authOverride: bypassAuth(),
    scheduleDeploy: opts.scheduleDeploy,
  });
  app.route('/api/installations', router);
  return app;
}

describe('POST /api/installations (AC-5)', () => {
  beforeAll(setupCryptoEnv);

  let storage: IGtmStorage;

  beforeEach(async () => {
    storage = await freshRedisStorage();
  });

  it('happy path: cria draft + resolve container hardcoded + 201', async () => {
    const accountId = await seedAccount(storage);
    const app = buildApp({ storage });

    const res = await app.request('/api/installations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hosting_account_id: accountId,
        site_domain: 'zerohum.com.br',
        brand_slug: 'zerohum',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: GtmInstallation };
    expect(body.data.id).toBeDefined();
    expect(body.data.brand_slug).toBe('zerohum');
    expect(body.data.gtm_container_id).toBe('GTM-WVWQVMP'); // resolvido backend
    expect(body.data.status).toBe('draft');
    expect(body.data.plugin_version).toBe('gtm4wp-1.18+bootstrap-v1');
  });

  it('brand_slug inválido (Zod) → 422 VALIDATION_ERROR', async () => {
    const accountId = await seedAccount(storage);
    const app = buildApp({ storage });

    const res = await app.request('/api/installations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hosting_account_id: accountId,
        site_domain: 'foo.com.br',
        brand_slug: 'bogus',
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('account inexistente → 404 NOT_FOUND', async () => {
    const app = buildApp({ storage });
    const res = await app.request('/api/installations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hosting_account_id: '00000000-0000-0000-0000-000000000000',
        site_domain: 'foo.com.br',
        brand_slug: 'mentoria',
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/installations/:id/deploy (AC-6)', () => {
  beforeAll(setupCryptoEnv);

  it('happy: 202 + job_id/sse_url + scheduleDeploy chamado', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    let scheduled = false;
    const app = buildApp({
      storage,
      scheduleDeploy: () => {
        scheduled = true;
      },
    });

    const res = await app.request(`/api/installations/${inst.id}/deploy`, {
      method: 'POST',
    });
    expect(res.status).toBe(202);
    const body = await res.json() as { data: { job_id: string; sse_url: string } };
    expect(body.data.job_id).toBe(inst.id);
    expect(body.data.sse_url).toContain(inst.id);
    expect(scheduled).toBe(true);
  });

  it('lock conflict: deploy concurrent → 409 DEPLOY_IN_PROGRESS', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // Pré-adquire lock direto pra simular deploy paralelo.
    const acquired = await storage.acquireLock(inst.id, 60);
    expect(acquired).toBe(true);

    const app = buildApp({
      storage,
      scheduleDeploy: () => {
        // no-op
      },
    });

    const res = await app.request(`/api/installations/${inst.id}/deploy`, {
      method: 'POST',
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('DEPLOY_IN_PROGRESS');
  });

  it('installation inexistente → 404', async () => {
    const storage = await freshRedisStorage();
    const app = buildApp({ storage });

    const res = await app.request(
      '/api/installations/00000000-0000-0000-0000-000000000000/deploy',
      { method: 'POST' },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/installations/:id (AC-7)', () => {
  beforeAll(setupCryptoEnv);

  it('retorna installation + Cache-Control no-store', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    const app = buildApp({ storage });

    const res = await app.request(`/api/installations/${inst.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json() as { data: GtmInstallation };
    expect(body.data.id).toBe(inst.id);
    expect(body.data.site_domain).toBe(inst.site_domain);
  });
});

describe('POST /api/installations/:id/revalidate (AC-8)', () => {
  beforeAll(setupCryptoEnv);

  it('stub validate passa → 200 + audit registrado', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    const app = buildApp({ storage });

    const res = await app.request(`/api/installations/${inst.id}/revalidate`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { passed: boolean; stage: string } };
    expect(body.data.passed).toBe(true);
    expect(body.data.stage).toBe('TODO_F_S06'); // stub atual

    const audit = await storage.listAudit(inst.id);
    expect(audit.some((a) => a.action === 'validation_passed')).toBe(true);
  });
});

describe('DELETE /api/installations/:id (AC-9)', () => {
  beforeAll(setupCryptoEnv);

  it('soft delete + X-Onda header + audit uninstalled', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    const app = buildApp({ storage });

    const res = await app.request(`/api/installations/${inst.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Onda')).toBe('Cleanup WP filesystem é Onda 1.5');
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe('uninstalled');

    const after = await storage.getInstallation(inst.id);
    expect(after?.status).toBe('uninstalled');

    const audit = await storage.listAudit(inst.id);
    expect(audit.some((a) => a.action === 'uninstalled')).toBe(true);
  });
});
