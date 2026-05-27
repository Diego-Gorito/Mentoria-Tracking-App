/**
 * resolveTenantGtmContainerId — lookup dinâmico do container GTM por tenant.
 *
 * F-S23 (Era 2): substitui `BRAND_GTM_MAP` hardcoded por query a
 * `core.tenant_containers.web_container_public_id`. Mantém fallback pra
 * Era 1 (single-tenant) quando tenant não foi provisionado via /provision-container.
 *
 * Order:
 *   1. SELECT web_container_public_id FROM core.tenant_containers
 *      WHERE tenant_id = $1 AND status = 'active'
 *      → se existe, retorna esse ID (Era 2 ativada pro tenant)
 *   2. Fallback BRAND_GTM_MAP[brand_slug] (Era 1 single-tenant)
 *   3. Senão throw GtmContainerNotResolvedError
 *
 * @see docs/adr-0009-gtm-master-clone-architecture.md §7 F-S23
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAND_GTM_MAP, type BrandSlug } from './constants';

export class GtmContainerNotResolvedError extends Error {
  constructor(tenantId: string, brandSlug?: string) {
    super(
      `Tenant ${tenantId} não tem container GTM (status=active) em core.tenant_containers` +
        (brandSlug ? ` nem em BRAND_GTM_MAP[${brandSlug}]` : ''),
    );
    this.name = 'GtmContainerNotResolvedError';
  }
}

export interface ResolverDeps {
  supabase: SupabaseClient;
}

export interface ResolveResult {
  gtm_container_public_id: string;
  /** 'era2' = veio de tenant_containers; 'era1' = BRAND_GTM_MAP fallback. */
  source: 'era2' | 'era1';
}

/**
 * Resolve container public ID pra novo install.
 *
 * Caller passa tenant_id + brand_slug opcional. Era 2 prioriza tenant_containers;
 * brand_slug é apenas fallback Era 1 + label UX.
 */
export async function resolveTenantGtmContainerId(
  tenantId: string,
  brandSlug: BrandSlug | undefined,
  deps: ResolverDeps,
): Promise<ResolveResult> {
  // Era 2 lookup
  const { data, error } = await deps.supabase
    .schema('core')
    .from('tenant_containers')
    .select('web_container_public_id, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();

  if (!error && data?.web_container_public_id) {
    return {
      gtm_container_public_id: data.web_container_public_id,
      source: 'era2',
    };
  }

  // Era 1 fallback
  if (brandSlug && BRAND_GTM_MAP[brandSlug]) {
    return {
      gtm_container_public_id: BRAND_GTM_MAP[brandSlug],
      source: 'era1',
    };
  }

  throw new GtmContainerNotResolvedError(tenantId, brandSlug);
}
