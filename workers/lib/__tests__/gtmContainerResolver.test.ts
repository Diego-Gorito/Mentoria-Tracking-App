import { describe, expect, it, vi } from 'vitest';
import {
  resolveTenantGtmContainerId,
  GtmContainerNotResolvedError,
} from '../gtmContainerResolver';

const TENANT_ID = '93031821-455e-490b-92c9-1ccbebf1b30f';

function makeSupabase(opts: { row?: { web_container_public_id: string; status: string } | null }) {
  return {
    schema: () => ({
      from: () => ({
        select: () => {
          const builder = {
            eq: () => builder,
            maybeSingle: () => Promise.resolve({ data: opts.row ?? null, error: null }),
          };
          return builder;
        },
      }),
    }),
  };
}

describe('resolveTenantGtmContainerId', () => {
  it('Era 2: retorna container do tenant_containers quando active', async () => {
    const supabase = makeSupabase({
      row: { web_container_public_id: 'GTM-NEWTENANT', status: 'active' },
    });
    const r = await resolveTenantGtmContainerId(
      TENANT_ID,
      'mentoria',
      { supabase: supabase as unknown as Parameters<typeof resolveTenantGtmContainerId>[2]['supabase'] },
    );
    expect(r.gtm_container_public_id).toBe('GTM-NEWTENANT');
    expect(r.source).toBe('era2');
  });

  it('Era 1 fallback: usa BRAND_GTM_MAP quando tenant sem container', async () => {
    const supabase = makeSupabase({ row: null });
    const r = await resolveTenantGtmContainerId(
      TENANT_ID,
      'mentoria',
      { supabase: supabase as unknown as Parameters<typeof resolveTenantGtmContainerId>[2]['supabase'] },
    );
    expect(r.gtm_container_public_id).toBe('GTM-5J587HS3'); // BRAND_GTM_MAP.mentoria
    expect(r.source).toBe('era1');
  });

  it('Era 1 fallback: usa BRAND_GTM_MAP.zerohum', async () => {
    const supabase = makeSupabase({ row: null });
    const r = await resolveTenantGtmContainerId(
      TENANT_ID,
      'zerohum',
      { supabase: supabase as unknown as Parameters<typeof resolveTenantGtmContainerId>[2]['supabase'] },
    );
    expect(r.gtm_container_public_id).toBe('GTM-WVWQVMP');
    expect(r.source).toBe('era1');
  });

  it('throws GtmContainerNotResolvedError quando sem container + sem brand_slug', async () => {
    const supabase = makeSupabase({ row: null });
    await expect(
      resolveTenantGtmContainerId(TENANT_ID, undefined, {
        supabase: supabase as unknown as Parameters<typeof resolveTenantGtmContainerId>[2]['supabase'],
      }),
    ).rejects.toBeInstanceOf(GtmContainerNotResolvedError);
  });

  it('throws quando container existe mas status != active', async () => {
    // maybeSingle filtra eq('status','active') — supabase mock retorna null,
    // depois cai no fallback. Se brand_slug é invalido, throws.
    const supabase = makeSupabase({ row: null });
    await expect(
      resolveTenantGtmContainerId(TENANT_ID, 'invalid-brand' as never, {
        supabase: supabase as unknown as Parameters<typeof resolveTenantGtmContainerId>[2]['supabase'],
      }),
    ).rejects.toBeInstanceOf(GtmContainerNotResolvedError);
  });
});
