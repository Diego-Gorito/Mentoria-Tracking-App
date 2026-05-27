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
import type { ValidationResult } from '../../lib/validator';

type ValidatorFn = (
  domain: string,
  expectedContainerId: string,
) => Promise<ValidationResult>;

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
  validate?: ValidatorFn;
}): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);
  const router = createInstallationsRouter({
    storage: opts.storage,
    providerFactory: opts.providerFactory ?? (() => new MockProvider()),
    authOverride: bypassAuth(),
    scheduleDeploy: opts.scheduleDeploy,
    validate: opts.validate,
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

  it('validate passa → 200 + audit registrado (mock injected)', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // F-S06: injeta mock validate pra não bater HTTP real durante test.
    const app = buildApp({
      storage,
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
    });

    const res = await app.request(`/api/installations/${inst.id}/revalidate`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { passed: boolean; stage: string } };
    expect(body.data.passed).toBe(true);
    expect(body.data.stage).toBe('full');

    const audit = await storage.listAudit(inst.id);
    expect(audit.some((a) => a.action === 'validation_passed')).toBe(true);
  });

  // Codex adversarial #4 fix (2026-05-27): /revalidate cobre transição
  // uploaded_pending_activation → installed (primeira ativação pós-deploy).
  // installed_at é gravado nessa transição (não em revalidates subsequentes).
  it('uploaded_pending_activation + validate passa → installed + installed_at gravado', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    // Pre-condição: install ficou em uploaded_pending_activation após deploy
    // (simula estado real pós-deployJob com Codex #4 fix).
    await storage.updateInstallation(inst.id, {
      status: 'uploaded_pending_activation',
      upload_dir_name: 'gtm4wp-zerohum-abc123',
    });

    const app = buildApp({
      storage,
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
    });

    const res = await app.request(`/api/installations/${inst.id}/revalidate`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);

    const after = await storage.getInstallation(inst.id);
    expect(after?.status).toBe('installed');
    expect(after?.installed_at).toBeDefined();
    // installed_at deve ser ISO8601 recente (< 5s).
    expect(Date.now() - new Date(after!.installed_at!).getTime()).toBeLessThan(5000);
  });

  it('uploaded_pending_activation + validate falha → failed (sem installed_at)', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);
    const inst = await seedInstallation(storage, accountId);

    await storage.updateInstallation(inst.id, {
      status: 'uploaded_pending_activation',
    });

    const app = buildApp({
      storage,
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
    });

    const res = await app.request(`/api/installations/${inst.id}/revalidate`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);

    const after = await storage.getInstallation(inst.id);
    expect(after?.status).toBe('failed');
    expect(after?.installed_at).toBeUndefined();
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

// ──────────────────────────────────────────────────────────────────────────
// Cross-tenant isolation — SECURITY FIX 2026-05-26 (Codex adversarial #1)
// ──────────────────────────────────────────────────────────────────────────
//
// Assegura que assertTenantOwnership() não vaza objetos de outro tenant. Cada
// teste seed account/installation com `tenant_id: 'tenant-A'`, então
// autentica como `tenant-B` e valida que cada endpoint retorna 404 (não 403 —
// não vaza existência).
describe('Cross-tenant isolation (Codex #1)', () => {
  beforeAll(setupCryptoEnv);

  const TENANT_A = '11111111-1111-1111-1111-11111111aaaa';
  const TENANT_B = '22222222-2222-2222-2222-22222222bbbb';

  async function seedAccountForTenant(
    storage: IGtmStorage,
    tenantId: string,
  ): Promise<AccountId> {
    const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY!;
    const tokenEncrypted = await sealEncrypt('mock-token', pub);
    const acc = await storage.createAccount({
      tenant_id: tenantId as never,
      provider: 'hostinger',
      account_label: `Test ${tenantId}`,
      token_encrypted: tokenEncrypted,
      status: 'active',
    });
    return acc.id;
  }

  function buildAppForTenant(storage: IGtmStorage, tenantId: string): Hono {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.onError(errorHandler);
    const router = createInstallationsRouter({
      storage,
      providerFactory: () => new MockProvider(),
      authOverride: bypassAuth({
        userId: '00000000-0000-0000-0000-00000000000a',
        email: 'attacker@example.com',
        tenantId,
        products: ['tracking'],
        currentProduct: 'tracking',
        accessToken: 'test-jwt',
      }),
    });
    app.route('/api/installations', router);
    return app;
  }

  it('GET /:id de outro tenant → 404 (não vaza existência)', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccountForTenant(storage, TENANT_A);
    const inst = await storage.createInstallation({
      tenant_id: TENANT_A as never,
      hosting_account_id: accountId,
      site_domain: 'tenant-a.com',
      brand_slug: 'zerohum',
      gtm_container_id: 'GTM-WVWQVMP',
      plugin_version: 'gtm4wp-1.18+bootstrap-v1',
      status: 'installed',
      attempt_count: 0,
    });

    // Autentica como tenant-B
    const app = buildAppForTenant(storage, TENANT_B);
    const res = await app.request(`/api/installations/${inst.id}`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('POST /:id/deploy cross-tenant → 404', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccountForTenant(storage, TENANT_A);
    const inst = await storage.createInstallation({
      tenant_id: TENANT_A as never,
      hosting_account_id: accountId,
      site_domain: 'tenant-a.com',
      brand_slug: 'zerohum',
      gtm_container_id: 'GTM-WVWQVMP',
      plugin_version: 'gtm4wp-1.18+bootstrap-v1',
      status: 'draft',
      attempt_count: 0,
    });

    const app = buildAppForTenant(storage, TENANT_B);
    const res = await app.request(`/api/installations/${inst.id}/deploy`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('POST / com hosting_account de outro tenant → 404', async () => {
    const storage = await freshRedisStorage();
    const accountIdA = await seedAccountForTenant(storage, TENANT_A);

    const app = buildAppForTenant(storage, TENANT_B);
    const res = await app.request('/api/installations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hosting_account_id: accountIdA,
        site_domain: 'evil.com',
        brand_slug: 'zerohum',
      }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
