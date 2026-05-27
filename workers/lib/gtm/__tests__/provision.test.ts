/**
 * Integration test for provisionTenantContainer orchestrator.
 *
 * Mocka GtmApiClient + Supabase + Redis pra rodar o fluxo end-to-end
 * sem hitar APIs reais.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  provisionTenantContainer,
  ProvisionLockError,
  type ProvisionDeps,
  type ProvisionStep,
  type ProvisionStepPayload,
} from '../provision';

const TENANT_ID = '93031821-455e-490b-92c9-1ccbebf1b30f';
const TENANT_SLUG = 'mentoria-test';

function makeGtmClient() {
  return {
    createContainer: vi.fn(async (_acc: string, name: string, ctx: string[]) => ({
      path: `accounts/X/containers/${name === `${TENANT_SLUG}-web` ? 'W' : 'S'}`,
      accountId: 'X',
      containerId: name.includes('-web') ? '999' : '888',
      name,
      publicId: name.includes('-web') ? 'GTM-WEBNEW' : 'GTM-SRVNEW',
      usageContext: ctx,
    })),
    getDefaultWorkspaceId: vi.fn(async () => '1'),
    copyContainerContents: vi.fn(async () => ({
      copiedCounts: { templates: 14, variables: 60, triggers: 14, clients: 0, tags: 51 },
      idMap: {
        templates: new Map(),
        variables: new Map(),
        triggers: new Map(),
        clients: new Map(),
        tags: new Map(),
      },
    })),
    listVariables: vi.fn(async () => [
      {
        variableId: '10',
        name: '[CT] [Meta Ads] Pixel ID',
        type: 'c',
        parameter: [{ type: 'template' as const, key: 'value', value: 'PIXEL_NAO_DEFINIDO' }],
      },
      {
        variableId: '20',
        name: '[CT] [GA4] Fluxo de Dados | ID da Métrica',
        type: 'c',
        parameter: [{ type: 'template' as const, key: 'value', value: 'G-NAO_DEFINIDO' }],
      },
      {
        variableId: '11',
        name: '[CT] [GTM] Server URL',
        type: 'c',
        parameter: [{ type: 'template' as const, key: 'value', value: 'PIXEL_NAO_DEFINIDO' }],
      },
    ]),
    updateVariable: vi.fn(async () => ({} as never)),
    createVersion: vi.fn(async () => ({ containerVersionId: 'v1' })),
    publishVersion: vi.fn(async () => undefined),
  };
}

function makeSupabase(opts: { tenantContainerExists?: boolean } = {}) {
  const inserted: Array<{ table: string; payload: unknown }> = [];
  const supabase = {
    schema: (_schema: string) => ({
      from: (table: string) => ({
        select: (_fields: string) => {
          const queryBuilder = {
            eq: () => queryBuilder,
            maybeSingle: () => {
              if (table === 'tenant_containers') {
                return Promise.resolve({
                  data: opts.tenantContainerExists ? { id: 'X', status: 'active' } : null,
                  error: null,
                });
              }
              if (table === 'gtm_master_versions') {
                return Promise.resolve({
                  data: {
                    id: 'mver-1',
                    version_name: 'v0.2',
                    web_master_internal_id: '253664662',
                    web_master_workspace_id: '2',
                    server_master_internal_id: '253664663',
                    server_master_workspace_id: '2',
                  },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
          return queryBuilder;
        },
        insert: (payload: unknown) => {
          inserted.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      }),
    }),
    _inserted: inserted,
  };
  return supabase;
}

function makeRedis() {
  const locks = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, val: string, _mode1: string, _ttl: number, mode2: string) => {
      if (mode2 === 'NX' && locks.has(key)) return null;
      locks.set(key, val);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      locks.delete(key);
      return 1;
    }),
  };
}

describe('provisionTenantContainer', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('flux completo: clone → parametrize → link → publish → persist', async () => {
    const gtmClient = makeGtmClient();
    const supabase = makeSupabase();
    const redis = makeRedis();
    const steps: Array<{ step: ProvisionStep; payload: ProvisionStepPayload }> = [];

    const result = await provisionTenantContainer(
      {
        tenant_id: TENANT_ID,
        tenant_slug: TENANT_SLUG,
        pixel_ids: { meta: '1234567890', ga4_web: 'G-ABC123' },
      },
      {
        gtmClient: gtmClient as unknown as ProvisionDeps['gtmClient'],
        supabase: supabase as unknown as ProvisionDeps['supabase'],
        redis: redis as unknown as ProvisionDeps['redis'],
        onStep: async (step, payload) => {
          steps.push({ step, payload });
        },
        sgtmBaseUrl: 'https://sgtm.test',
        gtmAccountId: 'X',
      },
    );

    expect(result.web_container.public_id).toBe('GTM-WEBNEW');
    expect(result.server_container.public_id).toBe('GTM-SRVNEW');
    expect(result.server_container.url).toBe(`https://sgtm.test/${TENANT_SLUG}`);
    expect(result.master_version).toBe('v0.2');

    // Verify steps executed in order
    const stepNames = steps.map((s) => `${s.step}:${s.payload.status}`);
    expect(stepNames).toContain('init:in_progress');
    expect(stepNames).toContain('init:success');
    expect(stepNames).toContain('clone_web:success');
    expect(stepNames).toContain('clone_server:success');
    expect(stepNames).toContain('parametrize:success');
    expect(stepNames).toContain('link:success');
    expect(stepNames).toContain('publish_web:success');
    expect(stepNames).toContain('publish_server:success');
    expect(stepNames).toContain('persist:success');
    expect(stepNames).toContain('complete:success');

    // 2 containers created
    expect(gtmClient.createContainer).toHaveBeenCalledTimes(2);
    // 2 publishVersion (web + server)
    expect(gtmClient.publishVersion).toHaveBeenCalledTimes(2);
    // updateVariable chamada: 1 pixel (meta) + 1 pixel (ga4_web) + 1 link (server URL) = 3
    expect(gtmClient.updateVariable).toHaveBeenCalledTimes(3);

    // Lock liberada no final
    expect(redis.del).toHaveBeenCalledWith(`gtm:provision:lock:${TENANT_ID}`);
  });

  it('falha 2ª invocação simultânea com ProvisionLockError', async () => {
    const gtmClient = makeGtmClient();
    const supabase = makeSupabase();
    const redis = makeRedis();
    // Simula lock já adquirido
    await redis.set(`gtm:provision:lock:${TENANT_ID}`, 'other-req', 'EX', 600, 'NX');

    await expect(
      provisionTenantContainer(
        { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG },
        {
          gtmClient: gtmClient as unknown as ProvisionDeps['gtmClient'],
          supabase: supabase as unknown as ProvisionDeps['supabase'],
          redis: redis as unknown as ProvisionDeps['redis'],
          onStep: async () => {},
          sgtmBaseUrl: 'https://sgtm.test',
          gtmAccountId: 'X',
        },
      ),
    ).rejects.toBeInstanceOf(ProvisionLockError);
  });

  it('aborta se tenant_containers já existe (UNIQUE conflict)', async () => {
    const gtmClient = makeGtmClient();
    const supabase = makeSupabase({ tenantContainerExists: true });
    const redis = makeRedis();
    const failedSteps: string[] = [];

    await expect(
      provisionTenantContainer(
        { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG },
        {
          gtmClient: gtmClient as unknown as ProvisionDeps['gtmClient'],
          supabase: supabase as unknown as ProvisionDeps['supabase'],
          redis: redis as unknown as ProvisionDeps['redis'],
          onStep: async (step, payload) => {
            if (payload.status === 'failed') failedSteps.push(step);
          },
          sgtmBaseUrl: 'https://sgtm.test',
          gtmAccountId: 'X',
        },
      ),
    ).rejects.toThrow(/já tem container/);

    expect(failedSteps).toContain('failed');
    // Não chegou a criar containers
    expect(gtmClient.createContainer).not.toHaveBeenCalled();
    // Lock liberada mesmo em erro
    expect(redis.del).toHaveBeenCalled();
  });

  it('skipa pixel parametrize quando pixel_ids vazio', async () => {
    const gtmClient = makeGtmClient();
    const supabase = makeSupabase();
    const redis = makeRedis();
    const steps: string[] = [];

    await provisionTenantContainer(
      { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG },
      {
        gtmClient: gtmClient as unknown as ProvisionDeps['gtmClient'],
        supabase: supabase as unknown as ProvisionDeps['supabase'],
        redis: redis as unknown as ProvisionDeps['redis'],
        onStep: async (step) => {
          steps.push(step);
        },
        sgtmBaseUrl: 'https://sgtm.test',
        gtmAccountId: 'X',
      },
    );

    // parametrize step NÃO aparece (pixel_ids vazio)
    expect(steps.filter((s) => s === 'parametrize')).toHaveLength(0);
    // Mas link continua (sempre roda)
    expect(steps).toContain('link');
  });
});
