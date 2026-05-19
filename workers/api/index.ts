// Mentoria Tracking API — Node.js via @hono/node-server
// Migrado de Cloudflare Worker → Easypanel KV8 em 2026-05-18
// Era 1: auth completo (signup/login/magic-link) + /api/me protegido.

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import authRouter from './auth'
import { authMiddleware, getJwtUser } from './middleware'
import { queryOne } from './db'

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
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

// --- /api/me (autenticado) ---

app.get('/api/me', authMiddleware, async (c) => {
  const jwt = getJwtUser(c)

  const data = await queryOne<{
    user_id: string
    email: string
    tenant_id: string
    slug: string
    name: string
    onboarding_step: number
    role: string
  }>(
    `SELECT u.user_id, u.email,
            t.tenant_id, t.slug, t.name, t.onboarding_step,
            tu.role
     FROM core.users u
     JOIN core.tenant_users tu ON tu.user_id = u.user_id
     JOIN core.tenants t ON t.tenant_id = tu.tenant_id
     WHERE u.user_id = $1::uuid
     ORDER BY tu.accepted_at ASC
     LIMIT 1`,
    [jwt.sub],
  )

  if (!data) {
    return c.json({ error: 'Usuario nao encontrado' }, 404)
  }

  return c.json(data)
})

// --- Tenants ---

app.get('/api/tenants/resolve', async (c) => {
  const host = c.req.query('host')
  if (!host) return c.json({ tenant: null })

  const tenant = await queryOne(
    `SELECT tenant_id, slug, name, plan, status, onboarding_step
     FROM core.tenants
     WHERE slug = $1 OR custom_domain = $1`,
    [host],
  )
  return c.json({ tenant: tenant ?? null })
})

app.get('/api/tenants/me', authMiddleware, async (c) => {
  const jwt = getJwtUser(c)

  const tenant = await queryOne(
    `SELECT t.tenant_id, t.slug, t.name, t.plan, t.status, t.onboarding_step, tu.role
     FROM core.tenants t
     JOIN core.tenant_users tu ON tu.tenant_id = t.tenant_id
     WHERE tu.user_id = $1::uuid
     ORDER BY tu.accepted_at ASC
     LIMIT 1`,
    [jwt.sub],
  )
  if (!tenant) return c.json({ error: 'Tenant nao encontrado' }, 404)
  return c.json(tenant)
})

// --- Credentials (stubs Era 1 sprint 2) ---

app.get('/api/credentials/:tenantId', authMiddleware, async (c) => {
  return c.json([])
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
