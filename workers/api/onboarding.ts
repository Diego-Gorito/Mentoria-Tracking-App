// onboarding.ts — Hono router /api/onboarding/*
// Fase 3 — ADR-0007 v1.2 (substitui queryOne pg por supabaseAdmin.rpc)
//
// Endpoints (todos atrás de authMiddleware):
//   POST   /check-slug       → { slug }              → { available: boolean }
//   POST   /create-tenant    → { slug, name }        → { tenant_id, slug, onboarding_step: 1 }
//   PATCH  /step/:n          → { data }              → { tenant_id, onboarding_step, onboarding_data }
//   POST   /complete         → {}                    → { tenant_id, completed_at }
//   GET    /state            → —                     → state jsonb ou null
//
// RPCs chamados:
//   core.tenant_check_slug_available(p_slug)
//   core.tenant_create(p_slug, p_name, p_owner_user_id)
//   core.tenant_get_onboarding_state(p_user_id)
//   core.tenant_update_onboarding(p_tenant_id, p_user_id, p_step, p_data)
//   core.tenant_complete_onboarding(p_tenant_id, p_user_id)
//
// LGPD: user_id em logs, NUNCA email.

import { Hono } from 'hono'
import { authMiddleware, getAuthCtx, type AuthContext } from './middleware'
import { supabaseAdmin } from './db'

const SLUG_REGEX = /^[a-z0-9-]{3,40}$/

type OnboardingVars = { authCtx: AuthContext }

const onboardingRouter = new Hono<{ Variables: OnboardingVars }>()

// Auth middleware obrigatorio em TODOS os endpoints
onboardingRouter.use('*', authMiddleware)

// Helper: executar RPC e retornar dado ou lancar erro
async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabaseAdmin.rpc(fn, args)
  if (error) throw new Error(error.message)
  return (data as T) ?? null
}

// ── POST /check-slug ─────────────────────────────────────────────────────────
onboardingRouter.post('/check-slug', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body JSON invalido' }, 400)
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (!slug) {
    return c.json({ error: 'slug obrigatorio' }, 400)
  }

  try {
    const available = await rpc<boolean>('tenant_check_slug_available', { p_slug: slug })
    return c.json({ available: available === true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[onboarding] check-slug error:', msg)
    return c.json({ error: 'Erro ao verificar slug' }, 500)
  }
})

// ── POST /create-tenant ──────────────────────────────────────────────────────
onboardingRouter.post('/create-tenant', async (c) => {
  const ctx = getAuthCtx(c)

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body JSON invalido' }, 400)
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!slug || !SLUG_REGEX.test(slug)) {
    return c.json({ error: 'slug invalido (use a-z, 0-9, hifens, 3-40 chars)' }, 400)
  }
  if (!name) {
    return c.json({ error: 'name obrigatorio' }, 400)
  }

  try {
    const result = await rpc<{ tenant_id: string }>('tenant_create', {
      p_slug: slug,
      p_name: name,
      p_owner_user_id: ctx.userId,
    })
    if (!result?.tenant_id) {
      return c.json({ error: 'Erro ao criar tenant' }, 500)
    }
    console.log(`[onboarding] tenant_create ok user_id=${ctx.userId} slug=${slug}`)
    return c.json({ tenant_id: result.tenant_id, slug, onboarding_step: 1 }, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('slug_taken')) return c.json({ error: 'slug_taken' }, 409)
    if (msg.includes('invalid_slug_format')) return c.json({ error: 'invalid_slug_format' }, 400)
    if (msg.includes('slug_reserved')) return c.json({ error: 'slug_reserved' }, 400)
    if (msg.includes('invalid_name')) return c.json({ error: 'invalid_name' }, 400)
    if (msg.includes('owner_user_not_found')) return c.json({ error: 'owner_user_not_found' }, 400)
    console.error('[onboarding] create-tenant error:', msg)
    return c.json({ error: 'Erro ao criar tenant' }, 500)
  }
})

// ── PATCH /step/:n ───────────────────────────────────────────────────────────
onboardingRouter.patch('/step/:n', async (c) => {
  const ctx = getAuthCtx(c)
  const stepParam = c.req.param('n')
  const step = Number.parseInt(stepParam, 10)

  if (!Number.isFinite(step) || step < 1 || step > 5) {
    return c.json({ error: 'step deve ser 1..5' }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body JSON invalido' }, 400)
  }

  const data = body.data ?? {}
  if (typeof data !== 'object' || Array.isArray(data) || data === null) {
    return c.json({ error: 'data deve ser objeto JSON' }, 400)
  }

  // Resolver tenant_id via state lookup (nao confia em body — JWT user_id e fonte)
  const stateResult = await rpc<{ tenant_id: string } | null>('tenant_get_onboarding_state', {
    p_user_id: ctx.userId,
  }).catch(() => null)

  const tenantId = stateResult?.tenant_id
  if (!tenantId) {
    return c.json({ error: 'tenant_not_found' }, 404)
  }

  try {
    const result = await rpc<Record<string, unknown>>('tenant_update_onboarding', {
      p_tenant_id: tenantId,
      p_user_id: ctx.userId,
      p_step: step,
      p_data: data,
    })
    return c.json(result ?? {})
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not_tenant_owner')) return c.json({ error: 'not_tenant_owner' }, 403)
    if (msg.includes('invalid_step')) return c.json({ error: 'invalid_step' }, 400)
    if (msg.includes('invalid_data_type')) return c.json({ error: 'invalid_data_type' }, 400)
    if (msg.includes('tenant_not_found')) return c.json({ error: 'tenant_not_found' }, 404)
    console.error('[onboarding] step PATCH error:', msg)
    return c.json({ error: 'Erro ao atualizar onboarding' }, 500)
  }
})

// ── POST /complete ────────────────────────────────────────────────────────────
onboardingRouter.post('/complete', async (c) => {
  const ctx = getAuthCtx(c)

  const stateResult = await rpc<{ tenant_id: string } | null>('tenant_get_onboarding_state', {
    p_user_id: ctx.userId,
  }).catch(() => null)

  const tenantId = stateResult?.tenant_id
  if (!tenantId) {
    return c.json({ error: 'tenant_not_found' }, 404)
  }

  try {
    const result = await rpc<{ tenant_id: string }>('tenant_complete_onboarding', {
      p_tenant_id: tenantId,
      p_user_id: ctx.userId,
    })
    if (!result?.tenant_id) {
      return c.json({ error: 'Erro ao completar onboarding' }, 500)
    }

    // Buscar completed_at atual
    const { data: tenantData } = await supabaseAdmin
      .schema('core')
      .from('tenants')
      .select('onboarding_completed_at')
      .eq('tenant_id', result.tenant_id)
      .limit(1)
      .single()

    console.log(`[onboarding] complete ok user_id=${ctx.userId} tenant_id=${result.tenant_id}`)
    return c.json({
      tenant_id: result.tenant_id,
      completed_at: (tenantData as { onboarding_completed_at: string } | null)?.onboarding_completed_at ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not_tenant_owner')) return c.json({ error: 'not_tenant_owner' }, 403)
    if (msg.includes('onboarding_incomplete')) return c.json({ error: 'onboarding_incomplete' }, 400)
    if (msg.includes('tenant_not_found')) return c.json({ error: 'tenant_not_found' }, 404)
    console.error('[onboarding] complete error:', msg)
    return c.json({ error: 'Erro ao completar onboarding' }, 500)
  }
})

// ── GET /state ────────────────────────────────────────────────────────────────
onboardingRouter.get('/state', async (c) => {
  const ctx = getAuthCtx(c)

  try {
    const result = await rpc<Record<string, unknown> | null>('tenant_get_onboarding_state', {
      p_user_id: ctx.userId,
    })
    return c.json(result ?? null)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[onboarding] state error:', msg)
    return c.json({ error: 'Erro ao buscar estado' }, 500)
  }
})

export { onboardingRouter }
export default onboardingRouter
