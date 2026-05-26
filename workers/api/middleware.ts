// middleware.ts — auth middleware via Supabase Auth JWT
// Fase 3 — ADR-0007 v1.2 (substitui verifyToken HS256 custom)
//
// Supabase Auth emite JWT assinado HMAC-SHA256 com o project JWT secret.
// supabase.auth.getUser(token) valida via JWKS do projeto automaticamente.
//
// Claims injetadas no contexto Hono:
//   userId     — auth.users.id (uuid)
//   email      — auth.users.email
//   tenantId   — claim customizada por ADR-0085 Custom Access Token Hook
//   products   — array de produtos habilitados (ex: ['tracking'])
//   currentProduct — produto ativo nesta sessao (ex: 'tracking')
//   accessToken — JWT bruto (pra criar createUserClient com RLS)

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
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data.user) {
      return c.json({ error: 'Token invalido ou expirado' }, 401)
    }

    const user = data.user
    const meta = user.user_metadata ?? {}
    const appMeta = user.app_metadata ?? {}

    // Claims do Custom Access Token Hook (ADR-0085):
    // tenant_id, products, current_product injetados pelo hook Deno.
    // Fallback para user_metadata se hook ainda nao deployado (staging early).
    const tenantId: string | null =
      (appMeta.tenant_id as string | undefined) ??
      (meta.tenant_id as string | undefined) ??
      null

    const products: string[] =
      (appMeta.products as string[] | undefined) ??
      (meta.products as string[] | undefined) ??
      []

    const currentProduct: string | null =
      (appMeta.current_product as string | undefined) ??
      (meta.current_product as string | undefined) ??
      null

    const ctx: AuthContext = {
      userId: user.id,
      email: user.email ?? '',
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
