/**
 * Constants compartilhadas — auto-provisioner GTM (story F-S05).
 *
 * Source-of-truth:
 * - `docs/stories/F-S05.md` AC-2 (MENTORIA_TENANT_ID placeholder) + AC-5 (BRAND_GTM_MAP).
 * - CLAUDE.md "Brands rastreadas" (4 GTM container IDs hardcoded).
 *
 * MVP single-tenant: o `MENTORIA_TENANT_ID` é um placeholder constante até
 * F-S14 smoke decidir se troca pelo UUID real puxado de `core.tenants WHERE
 * slug='mentoria'` via supabaseAdmin. Mantendo determinístico aqui pra evitar
 * I/O no boot e pra simplificar testes.
 */

import type { TenantId } from './storage/types';

/**
 * Tenant fixo do MVP F (single-tenant Mentoria).
 *
 * UUID resolvido em 2026-05-27 via `SELECT id FROM core.tenants WHERE
 * slug='mentoria'` no project Supabase `cjtwrzlwfqvzukjinmjr` (branch
 * tracking-rebase). Esse UUID corresponde a:
 *   - slug: 'mentoria'
 *   - name: 'Colégio Mentoria'
 *
 * Como fix #1 do Codex (commit f7f81e8) já usa `ctx.tenantId` do JWT em
 * todos os handlers (via `resolveTenantId(ctx)`), esta constante só serve
 * como fallback documental + smoke local quando o Custom Access Token Hook
 * estiver indisponível. Em prod, prevalece `ctx.tenantId` dos claims.
 */
export const MENTORIA_TENANT_ID = '93031821-455e-490b-92c9-1ccbebf1b30f' as TenantId;

/**
 * GTM container ID por brand_slug (F-S05 AC-5).
 *
 * Origem: CLAUDE.md "Brands rastreadas" — backend NUNCA aceita
 * `container_id` da UI (R4 do PRD mitigado). UI manda apenas `brand_slug`,
 * backend resolve via este mapa.
 *
 * `ifrn` reusa o container Mentoria por decisão UX (sites IFRN mostram
 * eventos junto da Mentoria, sem split).
 */
export const BRAND_GTM_MAP = Object.freeze({
  'mentoria': 'GTM-5J587HS3',
  'mentoria-app': 'GTM-KMK749ZW',
  'zerohum': 'GTM-WVWQVMP',
  'ifrn': 'GTM-5J587HS3', // reusa Mentoria — decisão UX MVP
} as const);

export type BrandSlug = keyof typeof BRAND_GTM_MAP;

/**
 * Type guard pra validar brand_slug recebido da UI antes de fazer lookup.
 */
export function isBrandSlug(value: unknown): value is BrandSlug {
  return typeof value === 'string' && value in BRAND_GTM_MAP;
}

/**
 * Plugin version snapshot — gravado em cada installation pra audit/drift
 * detection (F-S05 AC-5 + F-S13). Atualizado quando F-S13 publicar build novo.
 */
// F-S14 #5 (task #68): bump pra v2 — bootstrap agora renderiza GTM inline
// standalone quando GTM4WP upstream ausente (antes só configurava options).
export const DEFAULT_PLUGIN_VERSION = 'gtm4wp-1.18+bootstrap-v2' as const;
