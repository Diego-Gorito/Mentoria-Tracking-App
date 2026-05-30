// Mentoria Tracking API — Node.js via @hono/node-server
// Fase 3 — ADR-0007 v1.2 (Supabase rebase — auth + db migrados)
// Runtime: tsx (TypeScript direto, sem compilacao)
// Deploy: Easypanel KV8 tracking-api (REGRA #-2 Cloudflare-Last)

// Sentry init MUST be primeiro import (instrumenta http/fetch/etc auto).
// SENTRY_DSN é optional — se ausente, Sentry vira no-op silencioso.
// F-S14 #5 (2026-05-28 — task C horizonte 1).
import * as Sentry from '@sentry/node'
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'production',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0,
    sendDefaultPii: false, // LGPD: nunca enviar PII automaticamente
  })
  console.log(`[sentry] initialized env=${process.env.NODE_ENV} dsn=${(process.env.SENTRY_DSN || '').slice(0,30)}...`)
}

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import authRouter from './auth'
import analyticsRouter from './analytics'
import onboardingRouter from './onboarding'
import hostingAccountsRouter from './hosting-accounts'
import sitesRouter from './sites'
import installationsRouter from './installations'
import gtmRouter from './gtm'
import metaRouter from './meta'
import costSyncRouter from './costsync'
import { authMiddleware, getAuthCtx } from './middleware'
import { requestIdMiddleware } from './requestId'
import { errorHandler } from './errorHandler'
import { supabaseAdmin } from './db'

const app = new Hono()

// Request ID middleware — gera UUID v4 por request + propaga em X-Request-ID
// header. Precisa rodar ANTES de qualquer route handler/error handler pra que
// requestId esteja disponível no errorHandler.
app.use('*', requestIdMiddleware)

// Central error handler — mapeia HttpError, ProviderError, ZodError → JSON
// shape { error: { code, message, request_id } } per F-S05 AC-10.
app.onError(errorHandler)

// CORS — same-origin prod, localhost dev
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*'
      if (origin.includes('localhost')) return origin
      if (origin.includes('colegiomentoria.com.br')) return origin
      if (origin.includes('escola.click')) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

// --- Health (público) ---

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    env: process.env.NODE_ENV || 'production',
    ts: Date.now(),
  })
})

// --- Auth (público) ---

app.route('/api/auth', authRouter)

// --- Analytics (autenticado, multi-tenant via authMiddleware interno) ---

app.route('/api/analytics', analyticsRouter)

// --- Onboarding (autenticado — wizard 5 steps) ---

app.route('/api/onboarding', onboardingRouter)

// --- Auto-provisioner GTM (story F-S05 — autenticado via authMiddleware
//     interno de cada router; usa storage Redis + provider Hostinger).
app.route('/api/hosting-accounts', hostingAccountsRouter)
app.route('/api/sites', sitesRouter)
app.route('/api/installations', installationsRouter)

// --- GTM Master Clone provisioning (Era 2 — ADR-0009) ---
app.route('/api/gtm', gtmRouter)

// --- Meta (Facebook) Ads connector (System User Token paste, MVP sem OAuth) ---
app.route('/api/meta', metaRouter)

// --- Cost sync (custo de ad platforms → campaigns, READ-ONLY) ADR-0011 §5b ---
app.route('/api/cost-sync', costSyncRouter)

// --- /api/me (autenticado) ---

app.get('/api/me', authMiddleware, async (c) => {
  const ctx = getAuthCtx(c)

  // Buscar dados do tenant via Supabase
  const { data, error } = await supabaseAdmin
    .schema('core')
    .from('tenant_users')
    .select(`
      role,
      tenants!inner(id, slug, name, onboarding_step)
    `)
    .eq('user_id', ctx.userId)
    .order('accepted_at', { ascending: true })
    .limit(1)
    .single()

  if (error || !data) {
    // Retorna dados basicos do JWT mesmo sem tenant (user recem criado)
    return c.json({
      user_id: ctx.userId,
      email: ctx.email,
      tenant_id: ctx.tenantId,
      products: ctx.products,
      current_product: ctx.currentProduct,
    })
  }

  // Supabase JS retorna tenants como array (nested select), mesmo com !inner — pega [0]
  // col real: id (PK de core.tenants) — alias pra tenant_id no response pra manter shape SPA
  const tenantsArr = (data as unknown as { role: string; tenants: { id: string; slug: string; name: string; onboarding_step: number }[] }).tenants
  const tenant = Array.isArray(tenantsArr) ? tenantsArr[0] : tenantsArr

  return c.json({
    user_id: ctx.userId,
    email: ctx.email,
    tenant_id: tenant?.id ?? ctx.tenantId,
    slug: tenant?.slug,
    name: tenant?.name,
    onboarding_step: tenant?.onboarding_step,
    role: (data as { role: string }).role,
    products: ctx.products,
    current_product: ctx.currentProduct,
  })
})

// --- Tenants ---

app.get('/api/tenants/resolve', async (c) => {
  const host = c.req.query('host')
  if (!host) return c.json({ tenant: null })

  // col real: id (PK de core.tenants) — alias pra tenant_id no response pra manter shape SPA
  const { data: tenantRaw } = await supabaseAdmin
    .schema('core')
    .from('tenants')
    .select('id,slug,name,plan,status,onboarding_step')
    .or(`slug.eq.${host},custom_domain.eq.${host}`)
    .limit(1)
    .single()

  const tenant = tenantRaw
    ? { ...tenantRaw, tenant_id: tenantRaw.id, id: undefined }
    : null

  return c.json({ tenant })
})

app.get('/api/tenants/me', authMiddleware, async (c) => {
  const ctx = getAuthCtx(c)

  // col real: id (PK de core.tenants) — alias pra tenant_id no response pra manter shape SPA
  const { data: tenantRaw } = await supabaseAdmin
    .schema('core')
    .from('tenants')
    .select(`
      id, slug, name, plan, status, onboarding_step,
      tenant_users!inner(role)
    `)
    .eq('tenant_users.user_id', ctx.userId)
    .order('tenant_users.accepted_at', { ascending: true })
    .limit(1)
    .single()

  if (!tenantRaw) return c.json({ error: 'Tenant nao encontrado' }, 404)

  const { id, ...rest } = tenantRaw as typeof tenantRaw & { id: string }
  return c.json({ ...rest, tenant_id: id })
})

// --- Credentials (stubs Era 1 sprint 2) ---

app.get('/api/credentials/:tenantId', authMiddleware, async (_c) => {
  return _c.json([])
})

app.post('/api/credentials/:tenantId', authMiddleware, async (c) => {
  return c.json({ error: 'Nao implementado — Era 1 sprint 2' }, 501)
})

// --- Test connection (stub) ---

app.post('/api/test/:platform', authMiddleware, async (c) => {
  const platform = c.req.param('platform')
  return c.json({ error: `Teste nao implementado para "${platform}" — Era 1 sprint 2` }, 501)
})

// --- Query whitelist (stub) ---

app.post('/api/query/:name', authMiddleware, async (c) => {
  const name = c.req.param('name')
  return c.json({ error: `Query "${name}" nao implementada — Era 1 sprint 3` }, 501)
})

// --- Internal n8n (stub) ---

app.get('/api/internal/creds', async (c) => {
  const key = c.req.header('X-Internal-Key')
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    return c.json({ error: 'Acesso nao autorizado' }, 401)
  }
  return c.json({ error: 'Nao implementado — Era 1 sprint 2' }, 501)
})

// 404 fallback — shape AC-10 com request_id pra correlação logs.
// requestId vem do header já setado pelo requestIdMiddleware (linha 23 acima).
app.notFound((c) => {
  const requestId = c.res.headers.get('X-Request-ID') ?? ''
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: `Rota nao encontrada: ${c.req.method} ${c.req.path}`,
        request_id: requestId,
      },
    },
    404,
  )
})

// Entrypoint Node.js
const port = parseInt(process.env.PORT || '3000')
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`tracking-api listening on http://localhost:${info.port}`)
})
