/**
 * Integration tests pra republishTenantContainer (diff sync).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  republishTenantContainer,
  RepublishLockError,
  type RepublishDeps,
} from '../republish';

const TENANT_ID = '93031821-455e-490b-92c9-1ccbebf1b30f';
const TENANT_SLUG = 'mentoria-test';
const MASTER_OLD_ID = 'master-v02';
const MASTER_NEW_ID = 'master-v03';

function makeGtmClient(opts: {
  sourceTemplates?: any[];
  targetTemplates?: any[];
  sourceVariables?: any[];
  targetVariables?: any[];
  sourceTriggers?: any[];
  targetTriggers?: any[];
  sourceClients?: any[];
  targetClients?: any[];
  sourceTags?: any[];
  targetTags?: any[];
} = {}) {
  return {
    listTemplates: vi.fn().mockImplementation((_acc, container) => {
      return Promise.resolve(
        container === 'WEB-MASTER' || container === 'SERVER-MASTER'
          ? opts.sourceTemplates ?? []
          : opts.targetTemplates ?? [],
      );
    }),
    listVariables: vi.fn().mockImplementation((_acc, container) =>
      Promise.resolve(
        container.includes('MASTER') ? opts.sourceVariables ?? [] : opts.targetVariables ?? [],
      ),
    ),
    listTriggers: vi.fn().mockImplementation((_acc, container) =>
      Promise.resolve(
        container.includes('MASTER') ? opts.sourceTriggers ?? [] : opts.targetTriggers ?? [],
      ),
    ),
    listClients: vi.fn().mockImplementation((_acc, container) =>
      Promise.resolve(
        container.includes('MASTER') ? opts.sourceClients ?? [] : opts.targetClients ?? [],
      ),
    ),
    listTags: vi.fn().mockImplementation((_acc, container) =>
      Promise.resolve(
        container.includes('MASTER') ? opts.sourceTags ?? [] : opts.targetTags ?? [],
      ),
    ),
    getDefaultWorkspaceId: vi.fn().mockResolvedValue('1'),
    createTemplate: vi.fn().mockResolvedValue({}),
    createVariable: vi.fn().mockResolvedValue({}),
    updateVariable: vi.fn().mockResolvedValue({}),
    createTrigger: vi.fn().mockResolvedValue({}),
    createClient: vi.fn().mockResolvedValue({}),
    createTag: vi.fn().mockResolvedValue({}),
    createVersion: vi.fn().mockResolvedValue({ containerVersionId: 'v123' }),
    publishVersion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSupabase(opts: {
  tenantContainer?: any;
  masterVersion?: any;
  prevMasterName?: string;
}) {
  return {
    schema: () => ({
      from: (table: string) => ({
        select: () => {
          const builder = {
            eq: () => builder,
            maybeSingle: () => {
              if (table === 'tenant_containers') {
                return Promise.resolve({
                  data: opts.tenantContainer ?? null,
                  error: null,
                });
              }
              if (table === 'gtm_master_versions') {
                return Promise.resolve({
                  data: opts.masterVersion ?? null,
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
          return builder;
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    }),
  };
}

function makeRedis() {
  const locks = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, val: string, _m1: string, _ttl: number, m2: string) => {
      if (m2 === 'NX' && locks.has(key)) return null;
      locks.set(key, val);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      locks.delete(key);
      return 1;
    }),
  };
}

describe('republishTenantContainer', () => {
  it('retorna already_current quando master_version_id == current master.id', async () => {
    const gtmClient = makeGtmClient();
    const supabase = makeSupabase({
      tenantContainer: {
        id: 'tc-1',
        web_container_internal_id: 'WEB-NEW',
        server_container_internal_id: 'SRV-NEW',
        master_version_id: MASTER_NEW_ID,
      },
      masterVersion: {
        id: MASTER_NEW_ID,
        version_name: 'v0.3',
        web_master_internal_id: 'WEB-MASTER',
        web_master_workspace_id: '2',
        server_master_internal_id: 'SERVER-MASTER',
        server_master_workspace_id: '2',
      },
    });
    const redis = makeRedis();

    const result = await republishTenantContainer(
      { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG },
      {
        gtmClient: gtmClient as unknown as RepublishDeps['gtmClient'],
        supabase: supabase as unknown as RepublishDeps['supabase'],
        redis: redis as unknown as RepublishDeps['redis'],
        gtmAccountId: 'X',
      },
    );

    expect(result.status).toBe('already_current');
    expect(result.to_version).toBe('v0.3');
    // Não chamou nenhum sync
    expect(gtmClient.createTemplate).not.toHaveBeenCalled();
    expect(gtmClient.createVariable).not.toHaveBeenCalled();
  });

  it('lock conflict throws RepublishLockError', async () => {
    const gtmClient = makeGtmClient();
    const supabase = makeSupabase({
      tenantContainer: { id: 'tc-1', master_version_id: MASTER_OLD_ID },
      masterVersion: { id: MASTER_NEW_ID, version_name: 'v0.3' },
    });
    const redis = makeRedis();
    // Pre-acquire lock
    await redis.set(`gtm:republish:${TENANT_ID}`, 'other', 'EX', 600, 'NX');

    await expect(
      republishTenantContainer(
        { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG },
        {
          gtmClient: gtmClient as unknown as RepublishDeps['gtmClient'],
          supabase: supabase as unknown as RepublishDeps['supabase'],
          redis: redis as unknown as RepublishDeps['redis'],
          gtmAccountId: 'X',
        },
      ),
    ).rejects.toBeInstanceOf(RepublishLockError);
  });

  it('sync cria nova var [CT] do master que não existe no tenant', async () => {
    const gtmClient = makeGtmClient({
      sourceVariables: [
        {
          variableId: '99',
          name: '[CT] [Snap] Pixel ID',
          type: 'c',
          parameter: [{ type: 'template', key: 'value', value: 'PIXEL_NAO_DEFINIDO' }],
        },
      ],
      targetVariables: [],
    });
    const supabase = makeSupabase({
      tenantContainer: {
        id: 'tc-1',
        web_container_internal_id: 'WEB-NEW',
        server_container_internal_id: 'SRV-NEW',
        master_version_id: MASTER_OLD_ID,
      },
      masterVersion: {
        id: MASTER_NEW_ID,
        version_name: 'v0.3',
        web_master_internal_id: 'WEB-MASTER',
        web_master_workspace_id: '2',
        server_master_internal_id: 'SERVER-MASTER',
        server_master_workspace_id: '2',
      },
    });
    const redis = makeRedis();

    const result = await republishTenantContainer(
      { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG, autoPublish: false },
      {
        gtmClient: gtmClient as unknown as RepublishDeps['gtmClient'],
        supabase: supabase as unknown as RepublishDeps['supabase'],
        redis: redis as unknown as RepublishDeps['redis'],
        gtmAccountId: 'X',
      },
    );

    expect(result.status).toBe('updated');
    expect(result.counts.web.variables.created).toBe(1);
    expect(gtmClient.createVariable).toHaveBeenCalled();
  });

  it('preserva value de pixel ID var quando tenant já tem valor diferente', async () => {
    const gtmClient = makeGtmClient({
      sourceVariables: [
        {
          variableId: '99',
          name: '[CT] [Meta Ads] Pixel ID',
          type: 'c',
          parameter: [{ type: 'template', key: 'value', value: 'PIXEL_NAO_DEFINIDO' }],
        },
      ],
      targetVariables: [
        {
          variableId: '50',
          name: '[CT] [Meta Ads] Pixel ID',
          type: 'c',
          parameter: [{ type: 'template', key: 'value', value: '1234567890' }],
        },
      ],
    });
    const supabase = makeSupabase({
      tenantContainer: {
        id: 'tc-1',
        web_container_internal_id: 'WEB-NEW',
        server_container_internal_id: 'SRV-NEW',
        master_version_id: MASTER_OLD_ID,
      },
      masterVersion: {
        id: MASTER_NEW_ID,
        version_name: 'v0.3',
        web_master_internal_id: 'WEB-MASTER',
        web_master_workspace_id: '2',
        server_master_internal_id: 'SERVER-MASTER',
        server_master_workspace_id: '2',
      },
    });
    const redis = makeRedis();

    const result = await republishTenantContainer(
      { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG, autoPublish: false },
      {
        gtmClient: gtmClient as unknown as RepublishDeps['gtmClient'],
        supabase: supabase as unknown as RepublishDeps['supabase'],
        redis: redis as unknown as RepublishDeps['redis'],
        gtmAccountId: 'X',
      },
    );

    expect(result.counts.web.variables.preserved_value).toBe(1);
    // Confirma o param passado pra updateVariable preservou '1234567890'
    const updateCall = gtmClient.updateVariable.mock.calls.find(
      (c) => c[3] === '50',
    );
    expect(updateCall).toBeDefined();
    const updatedParam = updateCall![4].parameter[0];
    expect(updatedParam.value).toBe('1234567890');
  });

  it('skipa entities sem prefix [CT] (built-in vars, etc)', async () => {
    const gtmClient = makeGtmClient({
      sourceVariables: [
        {
          variableId: '1',
          name: 'Page URL',
          type: 'u',
          parameter: [],
        },
      ],
      targetVariables: [],
    });
    const supabase = makeSupabase({
      tenantContainer: {
        id: 'tc-1',
        web_container_internal_id: 'WEB-NEW',
        server_container_internal_id: 'SRV-NEW',
        master_version_id: MASTER_OLD_ID,
      },
      masterVersion: {
        id: MASTER_NEW_ID,
        version_name: 'v0.3',
        web_master_internal_id: 'WEB-MASTER',
        web_master_workspace_id: '2',
        server_master_internal_id: 'SERVER-MASTER',
        server_master_workspace_id: '2',
      },
    });
    const redis = makeRedis();

    const result = await republishTenantContainer(
      { tenant_id: TENANT_ID, tenant_slug: TENANT_SLUG, autoPublish: false },
      {
        gtmClient: gtmClient as unknown as RepublishDeps['gtmClient'],
        supabase: supabase as unknown as RepublishDeps['supabase'],
        redis: redis as unknown as RepublishDeps['redis'],
        gtmAccountId: 'X',
      },
    );

    expect(result.counts.web.variables.skipped).toBe(1);
    expect(result.counts.web.variables.created).toBe(0);
    expect(gtmClient.createVariable).not.toHaveBeenCalled();
  });
});
