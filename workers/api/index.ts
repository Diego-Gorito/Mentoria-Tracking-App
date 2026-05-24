// Mentoria Tracking API — Node.js via @hono/node-server
// Fase 3 — ADR-0007 v1.2 (Supabase rebase — auth + db migrados)
// Runtime: tsx (TypeScript direto, sem compilacao)
// Deploy: Easypanel KV8 tracking-api (REGRA #-2 Cloudflare-Last)

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import authRouter from './auth'
import analyticsRouter from './analytics'
import onboardingRouter from './onboarding'
import { authMiddleware, getAuthCtx } from './middleware'
import { supabaseAdmin } from './db'

const app = new Hono()

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

// --- /api/me (autenticado) ---

app.get('/api/me', authMiddleware, async (c) => {
  const ctx = getAuthCtx(c)

  // Buscar dados do tenant via Supabase
  const { data, error } = await supabaseAdmin
    .from('core.tenant_users')
    .select(`
      role,
      core.tenants!inner(tenant_id, slug, name, onboarding_step)
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

  const tenant = (data as { role: string; 'core.tenants': { tenant_id: string; slug: string; name: string; onboarding_step: number } })['core.tenants']

  return c.json({
    user_id: ctx.userId,
    email: ctx.email,
    tenant_id: tenant?.tenant_id ?? ctx.tenantId,
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

  const { data: tenant } = await supabaseAdmin
    .from('core.tenants')
    .select('tenant_id,slug,name,plan,status,onboarding_step')
    .or(`slug.eq.${host},custom_domain.eq.${host}`)
    .limit(1)
    .single()

  return c.json({ tenant: tenant ?? null })
})

app.get('/api/tenants/me', authMiddleware, async (c) => {
  const ctx = getAuthCtx(c)

  const { data: tenant } = await supabaseAdmin
    .from('core.tenants')
    .select(`
      tenant_id, slug, name, plan, status, onboarding_step,
      core.tenant_users!inner(role)
    `)
    .eq('core.tenant_users.user_id', ctx.userId)
    .order('core.tenant_users.accepted_at', { ascending: true })
    .limit(1)
    .single()

  if (!tenant) return c.json({ error: 'Tenant nao encontrado' }, 404)
  return c.json(tenant)
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

// 404 fallback
app.notFound((c) => {
  return c.json({ error: `Rota nao encontrada: ${c.req.method} ${c.req.path}` }, 404)
})

// Entrypoint Node.js
const port = parseInt(process.env.PORT || '3000')
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`tracking-api listening on http://localhost:${info.port}`)
})
