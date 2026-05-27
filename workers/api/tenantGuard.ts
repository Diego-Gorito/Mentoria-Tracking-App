/**
 * tenantGuard.ts — shared helpers pra isolation cross-tenant.
 *
 * SECURITY FIX 2026-05-26 (Codex adversarial review #1):
 * Antes: cada handler usava `MENTORIA_TENANT_ID` constante hardcoded — ignorava
 * `ctx.tenantId` do JWT. Cross-tenant access trivial (outro usuário logado no
 * tracking-app via outras features podia ler/modificar dados Mentoria).
 *
 * FIX: handlers usam `resolveTenantId(ctx)` que extrai do JWT verificado (via
 * `supabase.auth.getClaims` no middleware F-S07). E qualquer objeto pegado por
 * ID passa por `assertTenantOwnership(obj, ctx, kind, id)` antes de ser usado
 * — mismatch retorna 404 (não vaza existência cross-tenant).
 *
 * MVP single-tenant Mentoria-only (ADR-0008a §1): em prática ctx.tenantId é
 * sempre o tenant Mentoria pra Diego. Mas a guard impede que qualquer outro
 * usuário no Supabase auth (analytics/onboarding features deste mesmo SPA)
 * acesse dados desta feature acidentalmente.
 */

import type { AuthContext } from './middleware';
import type { TenantId } from '../lib/storage/types';
import { HttpError, NotFoundError } from './errors';

/**
 * Extrai tenant_id do JWT verified. Throw 403 se ausente — significa que o
 * Custom Access Token Hook (ADR-0085) não emitiu a claim OU usuário não tem
 * tenant atribuído ainda.
 */
export function resolveTenantId(ctx: AuthContext): TenantId {
  if (!ctx.tenantId) {
    throw new HttpError(
      403,
      'TENANT_CONTEXT_MISSING',
      'Usuário sem tenant_id no JWT. Verifique Custom Access Token Hook ou complete onboarding.',
    );
  }
  return ctx.tenantId as TenantId;
}

/**
 * Valida que `obj.tenant_id` pertence ao tenant do `ctx`. Mismatch → 404
 * (não vaza existência cross-tenant). Use em qualquer handler que pega
 * objeto por ID — GET/PATCH/DELETE/sub-actions.
 *
 * @example
 * const installation = await storage.getInstallation(id);
 * assertTenantOwnership(installation, ctx, 'installation', id);
 * // ↑ throw NotFoundError se !installation OR mismatch
 */
export function assertTenantOwnership<T extends { tenant_id: TenantId } | null | undefined>(
  obj: T,
  ctx: AuthContext,
  kind: string,
  id: string,
): asserts obj is NonNullable<T> {
  if (!obj) {
    throw new NotFoundError(kind, id);
  }
  const tenantId = resolveTenantId(ctx);
  if (obj.tenant_id !== tenantId) {
    // Não vaza existência — comporta-se como "não existe pra esse tenant".
    throw new NotFoundError(kind, id);
  }
}
