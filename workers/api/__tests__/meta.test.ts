/**
 * Tests pra /api/meta (conector Meta Ads — System User Token paste).
 *
 * Cenários cobertos:
 *  - POST /connect happy: token válido → 201 + ad_accounts + row upserted (status=connected)
 *  - POST /connect token inválido (Graph code 190) → 401 META_TOKEN_INVALID + sem upsert
 *  - POST /connect body inválido (token curto) → 422 VALIDATION_ERROR
 *  - POST /select: grava ad_account/pixel na row + escreve var no container GTM (republish/var update)
 *  - POST /select sem container provisionado → 200 container_synced:false (não falha)
 *  - GET /status: connected com pixel → { connected:true, pixel_id }
 *  - GET /status: sem row → { connected:false }
 *  - DELETE /disconnect: soft revoke → status=revoked
 *
 * TUDO mockado — NÃO hita Supabase nem Graph API reais. fetch do Meta é mockado
 * via metaClientFactory; supabase é um fake in-memory chainable; gtmClient é vi.fn.
 */

import './test-env';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMetaRouter } from '../meta';
import { errorHandler } from '../errorHandler';
import { requestIdMiddleware } from '../requestId';
import { bypassAuth, setupCryptoEnv, TEST_TENANT_ID } from './fixtures';
import { MetaClient } from '../../lib/meta';
import type { GtmApiClient } from '../../lib/gtm';

// ─── Fake Supabase (in-memory, chainable) ───────────────────────────────────

interface FakeState {
  meta: Record<string, unknown> | null; // tenant_integrations_meta row (single tenant)
  container: Record<string, unknown> | null; // tenant_containers row
  pixelSecrets: Array<Record<string, unknown>>;
  /** Espelha as chamadas pra asserts. */
  calls: { table: string; op: string; payload?: unknown }[];
}

function makeFakeSupabase(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    meta: initial.meta ?? null,
    container: initial.container ?? null,
    pixelSecrets: initial.pixelSecrets ?? [],
    calls: [],
  };

  function tableApi(table: string) {
    return {
      select: (_fields: string) => {
        const builder = {
          eq: () => builder,
          maybeSingle: () => {
            state.calls.push({ table, op: 'select' });
            if (table === 'tenant_integrations_meta') {
              return Promise.resolve({ data: state.meta, error: null });
            }
            if (table === 'tenant_containers') {
              return Promise.resolve({ data: state.container, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
      upsert: (payload: Record<string, unknown>, _opts?: unknown) => {
        state.calls.push({ table, op: 'upsert', payload });
        if (table === 'tenant_integrations_meta') {
          state.meta = { id: 'meta-row-1', ...(state.meta ?? {}), ...payload };
        } else if (table === 'tenant_pixel_secrets') {
          state.pixelSecrets.push(payload);
        }
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => ({
        eq: () => {
          state.calls.push({ table, op: 'update', payload });
          if (table === 'tenant_integrations_meta' && state.meta) {
            state.meta = { ...state.meta, ...payload };
          }
          return Promise.resolve({ error: null });
        },
      }),
      delete: () => ({
        eq: () => {
          state.calls.push({ table, op: 'delete' });
          if (table === 'tenant_integrations_meta') state.meta = null;
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  const client = {
    schema: (_schema: string) => ({ from: (table: string) => tableApi(table) }),
    _state: state,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

// ─── Fake Graph fetch (pro MetaClient real) ─────────────────────────────────

interface FetchScenario {
  /** Se true, /me retorna erro 190 (token inválido). */
  invalidToken?: boolean;
  adAccounts?: Array<{ id: string; name: string; account_status: number; business?: { id: string } }>;
  pixels?: Array<{ id: string; name: string }>;
}

function makeFakeFetch(scenario: FetchScenario): typeof fetch {

  return (async (url: string | URL): Promise<Response> => {
    const u = typeof url === 'string' ? url : url.toString();

    function json(body: unknown, status = 200): Response {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (scenario.invalidToken && u.includes('/me')) {
      return json(
        { error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } },
        400,
      );
    }
    if (u.includes('/me/permissions')) {
      return json({ data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'ads_management', status: 'granted' }] });
    }
    if (u.includes('/me/adaccounts')) {
      return json({ data: scenario.adAccounts ?? [] });
    }
    if (u.includes('/adspixels')) {
      return json({ data: scenario.pixels ?? [] });
    }
    if (u.includes('/me')) {
      return json({ id: 'system-user-1', name: 'mentoria-tracking' });
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
}

// ─── GTM client mock ─────────────────────────────────────────────────────────

function makeGtmClientMock(opts: { varExists?: boolean } = {}): GtmApiClient {
  const varExists = opts.varExists !== false;
  return {
    getDefaultWorkspaceId: vi.fn(async () => '3'),
    listVariables: vi.fn(async () =>
      varExists
        ? [
            {
              variableId: '99',
              name: '[CT] [Meta Ads] Pixel ID',
              type: 'c',
              parameter: [{ type: 'template' as const, key: 'value', value: 'PIXEL_NAO_DEFINIDO' }],
            },
          ]
        : [],
    ),
    updateVariable: vi.fn(async () => ({}) as never),
    createVersion: vi.fn(async () => ({ containerVersionId: 'ver-1' })),
    publishVersion: vi.fn(async () => undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── App builder ─────────────────────────────────────────────────────────────

function buildApp(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  fetchScenario: FetchScenario;
  gtmClient?: GtmApiClient;
}): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);
  const router = createMetaRouter({
    supabase: opts.supabase,
    metaClientFactory: () => new MetaClient({ fetchImpl: makeFakeFetch(opts.fetchScenario) }),
    gtmClient: opts.gtmClient ?? makeGtmClientMock(),
    authOverride: bypassAuth(),
  });
  app.route('/api/meta', router);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/meta/connect', () => {
  beforeAll(setupCryptoEnv);

  it('happy path: token válido → 201 + ad_accounts + upsert connected', async () => {
    const supabase = makeFakeSupabase();
    const app = buildApp({
      supabase,
      fetchScenario: {
        adAccounts: [
          { id: 'act_111', name: 'Conta Escola', account_status: 1, business: { id: 'biz-1' } },
        ],
      },
    });

    const res = await app.request('/api/meta/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'EAAB-valid-token-1234567890' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      business_id: string;
      ad_accounts: Array<{ id: string; name: string }>;
    };
    expect(body.business_id).toBe('biz-1');
    expect(body.ad_accounts).toHaveLength(1);
    expect(body.ad_accounts[0].id).toBe('act_111');

    // Row upserted com status connected + token cifrado (NÃO plaintext).
    const row = supabase._state.meta as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.status).toBe('connected');
    expect(row.business_id).toBe('biz-1');
    expect(typeof row.token_encrypted).toBe('string');
    expect(row.token_encrypted).not.toContain('EAAB-valid-token'); // cifrado!
    // NUNCA retorna token no response.
    expect(JSON.stringify(body)).not.toContain('token_encrypted');
    expect(JSON.stringify(body)).not.toContain('EAAB-valid-token');
  });

  it('token inválido (Graph 190) → 401 META_TOKEN_INVALID + sem upsert', async () => {
    const supabase = makeFakeSupabase();
    const app = buildApp({ supabase, fetchScenario: { invalidToken: true } });

    const res = await app.request('/api/meta/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'EAAB-bad-token-1234567890' }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('META_TOKEN_INVALID');
    // Nada gravado.
    expect(supabase._state.meta).toBeNull();
    expect(supabase._state.calls.some((c: { op: string }) => c.op === 'upsert')).toBe(false);
  });

  it('body inválido (token curto) → 422 VALIDATION_ERROR', async () => {
    const supabase = makeFakeSupabase();
    const app = buildApp({ supabase, fetchScenario: {} });

    const res = await app.request('/api/meta/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'short' }),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(supabase._state.meta).toBeNull();
  });
});

describe('POST /api/meta/select', () => {
  beforeAll(setupCryptoEnv);

  // Pré-condição comum: tenant já conectado (row com token cifrado).
  async function connectedSupabase() {
    const { sealEncrypt } = await import('../../lib/storage/crypto');
    const enc = await sealEncrypt('EAAB-valid-token-1234567890', process.env.STORAGE_ENCRYPTION_PUBLIC_KEY!);
    return makeFakeSupabase({
      meta: {
        id: 'meta-row-1',
        tenant_id: TEST_TENANT_ID,
        token_encrypted: enc,
        business_id: 'biz-1',
        ad_account_id: null,
        pixel_id: null,
        status: 'connected',
      },
    });
  }

  it('grava seleção + escreve var no container GTM (var update + publish)', async () => {
    const supabase = await connectedSupabase();
    supabase._state.container = { web_container_internal_id: '253999', status: 'active' };
    const gtm = makeGtmClientMock({ varExists: true });
    const app = buildApp({
      supabase,
      fetchScenario: { pixels: [{ id: '321', name: 'Pixel Escola' }] },
      gtmClient: gtm,
    });

    const res = await app.request('/api/meta/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_account_id: 'act_111', pixel_id: '321' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pixel_id: string; container_synced: boolean };
    expect(body.pixel_id).toBe('321');
    expect(body.container_synced).toBe(true);

    // Row atualizada com a seleção.
    expect(supabase._state.meta?.ad_account_id).toBe('act_111');
    expect(supabase._state.meta?.pixel_id).toBe('321');
    // Espelhado em tenant_pixel_secrets.
    expect(
      (supabase._state.pixelSecrets as Array<Record<string, unknown>>).some(
        (r) => r.platform === 'meta' && r.pixel_id === '321',
      ),
    ).toBe(true);

    // GTM: var atualizada com o pixel + versão publicada (mecanismo escolhido).
    expect(gtm.updateVariable).toHaveBeenCalledTimes(1);
    const updateArgs = (gtm.updateVariable as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    // arg[4] = body com parameter atualizado
    const updateBody = updateArgs[4] as { parameter: Array<{ key: string; value: string }> };
    expect(updateBody.parameter.find((p) => p.key === 'value')?.value).toBe('321');
    expect(gtm.createVersion).toHaveBeenCalledTimes(1);
    expect(gtm.publishVersion).toHaveBeenCalledTimes(1);
  });

  it('sem container provisionado → 200 container_synced:false (não falha)', async () => {
    const supabase = await connectedSupabase();
    supabase._state.container = null; // sem container
    const gtm = makeGtmClientMock();
    const app = buildApp({
      supabase,
      fetchScenario: {},
      gtmClient: gtm,
    });

    const res = await app.request('/api/meta/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_account_id: 'act_111', pixel_id: '321' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { container_synced: boolean; detail?: string };
    expect(body.container_synced).toBe(false);
    expect(body.detail).toMatch(/container/i);
    // Não tentou mexer no GTM.
    expect(gtm.updateVariable).not.toHaveBeenCalled();
    // Mas persistiu a seleção.
    expect(supabase._state.meta?.pixel_id).toBe('321');
  });

  it('sem conexão prévia → 404 META_NOT_CONNECTED', async () => {
    const supabase = makeFakeSupabase(); // sem row
    const app = buildApp({ supabase, fetchScenario: {} });

    const res = await app.request('/api/meta/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_account_id: 'act_111', pixel_id: '321' }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('META_NOT_CONNECTED');
  });
});

describe('GET /api/meta/status', () => {
  beforeAll(setupCryptoEnv);

  it('connected com pixel → { connected:true, pixel_id }', async () => {
    const supabase = makeFakeSupabase({
      meta: {
        id: 'm1',
        tenant_id: TEST_TENANT_ID,
        token_encrypted: 'xxx',
        business_id: 'biz-1',
        ad_account_id: 'act_111',
        pixel_id: '321',
        status: 'connected',
      },
    });
    const app = buildApp({ supabase, fetchScenario: {} });

    const res = await app.request('/api/meta/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connected: boolean;
      pixel_id: string | null;
      status: string | null;
    };
    expect(body.connected).toBe(true);
    expect(body.pixel_id).toBe('321');
    expect(body.status).toBe('connected');
    // status NUNCA expõe token.
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('sem row → { connected:false }', async () => {
    const supabase = makeFakeSupabase();
    const app = buildApp({ supabase, fetchScenario: {} });

    const res = await app.request('/api/meta/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean };
    expect(body.connected).toBe(false);
  });
});

describe('DELETE /api/meta/disconnect', () => {
  beforeAll(setupCryptoEnv);

  it('soft revoke → status=revoked', async () => {
    const supabase = makeFakeSupabase({
      meta: {
        id: 'm1',
        tenant_id: TEST_TENANT_ID,
        token_encrypted: 'xxx',
        business_id: 'biz-1',
        ad_account_id: 'act_111',
        pixel_id: '321',
        status: 'connected',
      },
    });
    const app = buildApp({ supabase, fetchScenario: {} });

    const res = await app.request('/api/meta/disconnect', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('revoked');
    expect(supabase._state.meta?.status).toBe('revoked');
  });
});
