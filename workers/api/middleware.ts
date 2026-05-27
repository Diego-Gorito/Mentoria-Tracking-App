// middleware.ts — auth middleware via Supabase Auth JWT
// Fase 3 — ADR-0007 v1.2 (substitui verifyToken HS256 custom)
//
// SECURITY FIX 2026-05-26 (Codex adversarial review #2):
// Antes lia tenant_id/products/current_product de `user.app_metadata` / `user.user_metadata`
// via `supabase.auth.getUser(token)`. PROBLEMAS:
//   (1) `user_metadata` é CLIENT-UPDATABLE — usuário malicioso pode forjar
//       `tenant_id` via `PATCH /auth/v1/user { data: { tenant_id: 'outro' }}`
//       e quebrar isolation cross-tenant.
//   (2) Custom Access Token Hook (ADR-0085, `supabase/functions/custom-access-token`)
//       emite claims TOP-LEVEL no JWT, NÃO em user_metadata. Leitura via getUser()
//       não retorna esses campos.
//
// FIX: usar `supabase.auth.getClaims(token)` que decode + verifica assinatura
// (JWKS) e retorna claims top-level reais. Estes são assinados pelo Supabase
// (não-forjáveis sem comprometer JWKS).
//
// Claims injetadas no contexto Hono (todas dos top-level JWT claims):
//   userId     — claims.sub
//   email      — claims.email
//   tenantId   — claims.tenant_id (Custom Access Token Hook)
//   products   — claims.products (Custom Access Token Hook)
//   currentProduct — claims.current_product (Custom Access Token Hook)
//   accessToken — JWT bruto (pra createUserClient com RLS downstream)

import type { Context, Next } from 'hono'
import { supabaseAdmin } from './db'

export type AuthContext = {
  userId: string
  email: string
  tenantId: string | null
  products: string[]
  currentProduct: string | null
  accessToken: string
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Browser EventSource NÃO suporta custom headers — F-S12 SSE endpoint usa
  // fallback `?token=<jwt>` query param. Token em URL aparece em access logs
  // (aceito tradeoff pra SSE; outros endpoints continuam preferindo header).
  const auth = c.req.header('Authorization')
  const headerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  const queryToken = c.req.query('token') ?? null
  const token = headerToken ?? queryToken

  if (!token) {
    return c.json({ error: 'Acesso nao autorizado' }, 401)
  }

  try {
    // getClaims valida assinatura JWT (JWKS) e retorna top-level claims.
    // Variantes do retorno:
    //  - { data: { claims, header, signature }, error: null } → sucesso
    //  - { data: null, error: AuthError } → falha de validação
    //  - { data: null, error: null } → JWT não-assimétrico não verificado
    //    (paranoid: tratamos como falha)
    const { data, error } = await supabaseAdmin.auth.getClaims(token)
    if (error || !data) {
      return c.json({ error: 'Token invalido ou expirado' }, 401)
    }

    const claims = data.claims as unknown as Record<string, unknown>
    const userId = typeof claims.sub === 'string' ? claims.sub : null
    if (!userId) {
      return c.json({ error: 'Token sem sub claim' }, 401)
    }

    const email = typeof claims.email === 'string' ? claims.email : ''
    const tenantId =
      typeof claims.tenant_id === 'string' ? claims.tenant_id : null
    const products = Array.isArray(claims.products)
      ? (claims.products as string[])
      : []
    const currentProduct =
      typeof claims.current_product === 'string' ? claims.current_product : null

    const ctx: AuthContext = {
      userId,
      email,
      tenantId,
      products,
      currentProduct,
      accessToken: token,
    }

    c.set('authCtx', ctx)
    await next()
  } catch {
    return c.json({ error: 'Token invalido ou expirado' }, 401)
  }
}

// Helper — recuperar contexto de auth do handler
export function getAuthCtx(c: Context): AuthContext {
  return c.get('authCtx') as AuthContext
}

// Compat shim — alguns handlers usam getJwtUser (nome legado).
// Retorna estrutura compatível com o antigo JwtPayload.
export function getJwtUser(c: Context): {
  sub: string
  email: string
  tenant_slug?: string
  role?: string
  tenantId: string | null
} {
  const ctx = getAuthCtx(c)
  return {
    sub: ctx.userId,
    email: ctx.email,
    tenant_slug: undefined, // tenant_slug nao esta mais no JWT — usar tenantId
    role: undefined,
    tenantId: ctx.tenantId,
  }
}
