// onboarding.ts — Hono router /api/onboarding/*
// Backend pro Onboarding Wizard 5 steps. Multi-tenant: tenant_id sempre
// resolvido server-side via JWT user_id (não confia em body do cliente).
// LGPD: user_id em logs, NUNCA email/data sensível.
//
// Endpoints (todos atrás de authMiddleware):
//   POST   /check-slug       → { slug }              → { available: boolean }
//   POST   /create-tenant    → { slug, name }        → { tenant_id, slug, onboarding_step: 1 }
//   PATCH  /step/:n          → { data }              → { tenant_id, onboarding_step, onboarding_data }
//   POST   /complete         → {}                    → { tenant_id, completed_at }
//   GET    /state            → —                     → state jsonb ou null
//
// Padrões (seguem auth.ts):
//   - try/catch retornando 400/404/409 mapeado por código SQL (raise) ou message
//   - 500 em erros inesperados com console.error '[onboarding] ...'
//   - validação básica de body antes de chamar SQL (defesa em profundidade)

import { Hono } from 'hono'
import type { JwtPayload } from './jwt'
import { authMiddleware, getJwtUser } from './middleware'
import { queryOne } from './db'

const SLUG_REGEX = /^[a-z0-9-]{3,40}$/

type OnboardingVars = { jwtUser: JwtPayload }

const onboardingRouter = new Hono<{ Variables: OnboardingVars }>()

// Auth middleware obrigatório em TODOS os endpoints
onboardingRouter.use('*', authMiddleware)

// ── POST /check-slug ────────────────────────────────────────────────────────
// Body: { slug }
// Response: { available: boolean }
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
    const row = await queryOne<{ available: boolean }>(
      'SELECT core.tenant_check_slug_available($1) AS available',
      [slug],
    )
    return c.json({ available: row?.available === true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[onboarding] check-slug error:', msg)
    return c.json({ error: 'Erro ao verificar slug' }, 500)
  }
})

// ── POST /create-tenant ─────────────────────────────────────────────────────
// Body: { slug, name }
// Response: { tenant_id, slug, onboarding_step: 1 }
// Erros mapeados:
//   - invalid_slug_format / slug_reserved → 400
//   - slug_taken                          → 409
//   - invalid_name / owner_user_not_found → 400
onboardingRouter.post('/create-tenant', async (c) => {
  const jwt = getJwtUser(c)

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
    const row = await queryOne<{ tenant_id: string }>(
      'SELECT core.tenant_create($1, $2, $3::uuid) AS tenant_id',
      [slug, name, jwt.sub],
    )
    if (!row?.tenant_id) {
      return c.json({ error: 'Erro ao criar tenant' }, 500)
    }
    console.log(`[onboarding] tenant_create ok user_id=${jwt.sub} slug=${slug}`)
    return c.json({ tenant_id: row.tenant_id, slug, onboarding_step: 1 }, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('slug_taken')) {
      return c.json({ error: 'slug_taken' }, 409)
    }
    if (msg.includes('invalid_slug_format')) {
      return c.json({ error: 'invalid_slug_format' }, 400)
    }
    if (msg.includes('slug_reserved')) {
      return c.json({ error: 'slug_reserved' }, 400)
    }
    if (msg.includes('invalid_name')) {
      return c.json({ error: 'invalid_name' }, 400)
    }
    if (msg.includes('owner_user_not_found')) {
      return c.json({ error: 'owner_user_not_found' }, 400)
    }
    console.error('[onboarding] create-tenant error:', msg)
    return c.json({ error: 'Erro ao criar tenant' }, 500)
  }
})

// ── PATCH /step/:n ──────────────────────────────────────────────────────────
// Body: { data: {} }
// Response: { tenant_id, onboarding_step, onboarding_data }
// Erros:
//   - invalid_step / invalid_data_type → 400
//   - not_tenant_owner                 → 403
//   - tenant_not_found                 → 404
onboardingRouter.patch('/step/:n', async (c) => {
  const jwt = getJwtUser(c)
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

  // Resolver tenant_id via state lookup (não confia em body — JWT user_id é fonte)
  const stateRow = await queryOne<{ state: { tenant_id: string } | null }>(
    'SELECT core.tenant_get_onboarding_state($1::uuid) AS state',
    [jwt.sub],
  )
  const tenantId = stateRow?.state?.tenant_id
  if (!tenantId) {
    return c.json({ error: 'tenant_not_found' }, 404)
  }

  try {
    const row = await queryOne<{ result: Record<string, unknown> }>(
      'SELECT core.tenant_update_onboarding($1::uuid, $2::uuid, $3, $4::jsonb) AS result',
      [tenantId, jwt.sub, step, JSON.stringify(data)],
    )
    return c.json(row?.result ?? {})
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not_tenant_owner')) {
      return c.json({ error: 'not_tenant_owner' }, 403)
    }
    if (msg.includes('invalid_step')) {
      return c.json({ error: 'invalid_step' }, 400)
    }
    if (msg.includes('invalid_data_type')) {
      return c.json({ error: 'invalid_data_type' }, 400)
    }
    if (msg.includes('tenant_not_found')) {
      return c.json({ error: 'tenant_not_found' }, 404)
    }
    console.error('[onboarding] step PATCH error:', msg)
    return c.json({ error: 'Erro ao atualizar onboarding' }, 500)
  }
})

// ── POST /complete ──────────────────────────────────────────────────────────
// Body: {}  (tenant resolvido via JWT)
// Response: { tenant_id, completed_at }
// Erros:
//   - not_tenant_owner       → 403
//   - onboarding_incomplete  → 400 (step<5)
//   - tenant_not_found       → 404
onboardingRouter.post('/complete', async (c) => {
  const jwt = getJwtUser(c)

  const stateRow = await queryOne<{ state: { tenant_id: string } | null }>(
    'SELECT core.tenant_get_onboarding_state($1::uuid) AS state',
    [jwt.sub],
  )
  const tenantId = stateRow?.state?.tenant_id
  if (!tenantId) {
    return c.json({ error: 'tenant_not_found' }, 404)
  }

  try {
    const row = await queryOne<{ tenant_id: string }>(
      'SELECT core.tenant_complete_onboarding($1::uuid, $2::uuid) AS tenant_id',
      [tenantId, jwt.sub],
    )
    if (!row?.tenant_id) {
      return c.json({ error: 'Erro ao completar onboarding' }, 500)
    }

    // Fetch completed_at pra retornar (state pode estar stale; query direto)
    const after = await queryOne<{ completed_at: string }>(
      'SELECT onboarding_completed_at AS completed_at FROM core.tenants WHERE tenant_id = $1::uuid',
      [row.tenant_id],
    )
    console.log(`[onboarding] complete ok user_id=${jwt.sub} tenant_id=${row.tenant_id}`)
    return c.json({
      tenant_id: row.tenant_id,
      completed_at: after?.completed_at ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not_tenant_owner')) {
      return c.json({ error: 'not_tenant_owner' }, 403)
    }
    if (msg.includes('onboarding_incomplete')) {
      return c.json({ error: 'onboarding_incomplete' }, 400)
    }
    if (msg.includes('tenant_not_found')) {
      return c.json({ error: 'tenant_not_found' }, 404)
    }
    console.error('[onboarding] complete error:', msg)
    return c.json({ error: 'Erro ao completar onboarding' }, 500)
  }
})

// ── GET /state ──────────────────────────────────────────────────────────────
// Response: state jsonb { tenant_id, slug, name, onboarding_step, onboarding_data,
//                        onboarding_completed_at } ou null
onboardingRouter.get('/state', async (c) => {
  const jwt = getJwtUser(c)

  try {
    const row = await queryOne<{ state: Record<string, unknown> | null }>(
      'SELECT core.tenant_get_onboarding_state($1::uuid) AS state',
      [jwt.sub],
    )
    // pg driver retorna jsonb como objeto JS direto
    return c.json(row?.state ?? null)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[onboarding] state error:', msg)
    return c.json({ error: 'Erro ao buscar estado' }, 500)
  }
})

export { onboardingRouter }
export default onboardingRouter
