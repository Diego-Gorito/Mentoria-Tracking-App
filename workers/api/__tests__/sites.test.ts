/**
 * Tests pra /api/sites (F-S05 AC-4).
 *
 * Cenários:
 *  - Happy merge: 1 account + 2 sites do provider → 2 EnrichedSite, sem installation
 *  - Site COM installation: merge inclui status/brand_slug/container_id/installation_id
 *  - Cache 60s: 2 chamadas consecutivas só chamam provider.listSites 1x
 */

import './test-env';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSitesRouter, __clearSitesCache } from '../sites';
import { errorHandler } from '../errorHandler';
import { requestIdMiddleware } from '../requestId';
import { MockProvider } from '../../lib/providers/MockProvider';
import type { IHostingProvider, Site } from '../../lib/providers';
import { sealEncrypt } from '../../lib/storage/crypto';
import {
  bypassAuth,
  freshRedisStorage,
  setupCryptoEnv,
  TEST_TENANT_ID,
} from './fixtures';
import type { IGtmStorage } from '../../lib/storage';
import type { AccountId } from '../../lib/storage/types';

async function seedAccount(storage: IGtmStorage, label = 'Diego'): Promise<AccountId> {
  const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY!;
  const tokenEncrypted = await sealEncrypt('mock-token', pub);
  const acc = await storage.createAccount({
    tenant_id: TEST_TENANT_ID,
    provider: 'hostinger',
    account_label: label,
    token_encrypted: tokenEncrypted,
    status: 'active',
  });
  return acc.id;
}

function buildApp(opts: {
  storage: IGtmStorage;
  providerFactory: (
    type: 'hostinger',
    creds: { token: string; wpAdminPassword?: string },
  ) => IHostingProvider;
  now?: () => number;
}): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);
  const router = createSitesRouter({
    storage: opts.storage,
    providerFactory: opts.providerFactory,
    authOverride: bypassAuth(),
    now: opts.now,
  });
  app.route('/api/sites', router);
  return app;
}

describe('GET /api/sites (AC-4)', () => {
  beforeAll(setupCryptoEnv);

  beforeEach(() => {
    __clearSitesCache();
  });

  it('happy merge: 2 sites do provider sem installation → EnrichedSite[]', async () => {
    const storage = await freshRedisStorage();
    await seedAccount(storage);

    const sites: Site[] = [
      { domain: 'a.com.br', is_wordpress: true, wp_version: '6.5.3' },
      { domain: 'b.com.br', is_wordpress: true, wp_version: '6.5.3' },
    ];

    const app = buildApp({
      storage,
      providerFactory: () => new MockProvider({ sites }),
    });

    const res = await app.request('/api/sites');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<Record<string, unknown>> };
    expect(body.data).toHaveLength(2);
    expect(body.data[0].domain).toBe('a.com.br');
    expect(body.data[0].installation_id).toBeUndefined();
    expect(body.data[0].hosting_account_id).toBeDefined();
  });

  it('site COM installation: merge inclui status + brand_slug + container_id', async () => {
    const storage = await freshRedisStorage();
    const accountId = await seedAccount(storage);

    const installation = await storage.createInstallation({
      tenant_id: TEST_TENANT_ID,
      hosting_account_id: accountId,
      site_domain: 'zerohum.com.br',
      brand_slug: 'zerohum',
      gtm_container_id: 'GTM-WVWQVMP',
      plugin_version: 'gtm4wp-1.18+bootstrap-v1',
      status: 'installed',
      attempt_count: 1,
    });

    const app = buildApp({
      storage,
      providerFactory: () =>
        new MockProvider({
          sites: [{ domain: 'zerohum.com.br', is_wordpress: true }],
        }),
    });

    const res = await app.request('/api/sites');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<Record<string, unknown>> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].domain).toBe('zerohum.com.br');
    expect(body.data[0].status).toBe('installed');
    expect(body.data[0].brand_slug).toBe('zerohum');
    expect(body.data[0].container_id).toBe('GTM-WVWQVMP');
    expect(body.data[0].installation_id).toBe(installation.id);
  });

  it('cache 60s: 2 chamadas só invocam provider.listSites 1x', async () => {
    const storage = await freshRedisStorage();
    await seedAccount(storage);

    let listSitesCalls = 0;
    const stubProvider: IHostingProvider = {
      listSites: async () => {
        listSitesCalls += 1;
        return [{ domain: 'cache.com.br', is_wordpress: true }];
      },
      verifyDomain: async () => true,
      deployPlugin: vi.fn(),
      pingToken: async () => true,
    };

    const app = buildApp({
      storage,
      providerFactory: () => stubProvider,
      now: () => 1000, // tempo fixo — dentro da janela do cache
    });

    await app.request('/api/sites');
    await app.request('/api/sites');

    expect(listSitesCalls).toBe(1);

    // Avança tempo além do TTL → invalida cache
    const app2 = buildApp({
      storage,
      providerFactory: () => stubProvider,
      now: () => 1000 + 70_000, // > 60s
    });
    await app2.request('/api/sites');
    expect(listSitesCalls).toBe(2);
  });
});
