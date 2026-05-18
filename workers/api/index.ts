// Mentoria Tracking API — Node.js via @hono/node-server
// Migrado de Cloudflare Worker → Easypanel KV8 em 2026-05-18
// Hono app idêntico; apenas adaptado o entrypoint pra Node.js.
// TODO: implementar /api/auth/*, /api/tenants/*, /api/credentials/*, /api/query/*

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'

type Bindings = {
  ENVIRONMENT?: string
  // Secrets via Easypanel Env tab (ADR-005):
  // DATABASE_URL_OWNER — postgres connection string KV2
  // JWT_SECRET         — 32+ chars random
  // VAULT_KEY          — pgcrypto master key
  // RESEND_API_KEY     — envio magic-link emails
  // INTERNAL_API_KEY   — shared secret pra /api/internal/creds (n8n → API)
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS — permite same-origin em prod, localhost em dev
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

// --- Health ---

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    env: process.env.ENVIRONMENT || 'production',
    ts: Date.now(),
  })
})

// --- Auth ---

app.post('/api/auth/signup', async (c) => {
  // TODO: validar email/password, criar user no KV2, retornar JWT
  return c.json({ error: 'Not implemented — Era 1 sprint 1' }, 501)
})

app.post('/api/auth/login', async (c) => {
  // TODO: verificar bcrypt hash, emitir JWT HS256 com claims { sub, email, tenantId, role }
  return c.json({ error: 'Not implemented — Era 1 sprint 1' }, 501)
})

app.post('/api/auth/magic-link', async (c) => {
  // TODO: gerar token HMAC, salvar no KV2 com TTL 15min, enviar via Resend
  return c.json({ error: 'Not implemented — Era 1 sprint 1' }, 501)
})

app.get('/api/auth/magic-link/verify', async (c) => {
  // TODO: verificar token da query string, emitir JWT, redirecionar pra dashboard
  return c.json({ error: 'Not implemented — Era 1 sprint 1' }, 501)
})

// --- Tenants ---

app.get('/api/tenants/resolve', async (c) => {
  // TODO: SELECT * FROM core.tenants WHERE slug = extract_slug(host) OR custom_domain = host
  const _host = c.req.query('host')
  return c.json({ tenant: null })
})

app.get('/api/tenants/me', async (c) => {
  // TODO: ler tenant do JWT + buscar core.tenants
  return c.json({ error: 'Not implemented — Era 1 sprint 1' }, 501)
})

app.post('/api/tenants', async (c) => {
  // TODO: criar tenant no KV2 + core.tenants
  return c.json({ error: 'Not implemented — Era 1 sprint 1' }, 501)
})

app.put('/api/tenants/:tenantId', async (c) => {
  // TODO: update tenant metadata
  return c.json({ error: 'Not implemented — Era 1 sprint 2' }, 501)
})

// --- Credentials ---

app.get('/api/credentials/:tenantId', async (c) => {
  // TODO: SELECT provider_id, status, last_validated_at, extra_config
  //       FROM core.tenant_credentials WHERE tenant_id = :tenantId
  //       (NÃO retornar value_encrypted)
  const _tenantId = c.req.param('tenantId')
  return c.json([])
})

app.post('/api/credentials/:tenantId', async (c) => {
  // TODO: pgp_sym_encrypt(value, vault_key) + upsert core.tenant_credentials
  return c.json({ error: 'Not implemented — Era 1 sprint 2' }, 501)
})

// --- Test connection ---

app.post('/api/test/:platform', async (c) => {
  // TODO: pra cada plataforma, chamar API externa pra validar credencial
  const platform = c.req.param('platform')
  return c.json({ error: `Test not implemented for platform "${platform}" — Era 1 sprint 2` }, 501)
})

// --- Query whitelist runner ---

app.post('/api/query/:name', async (c) => {
  // TODO: whitelist de queries permitidas (kpi_summary, funnel_daily, roas_by_platform, etc.)
  //       SET LOCAL app.current_school_id = tenantId antes de executar
  const name = c.req.param('name')
  const _tenantId = c.req.query('tenantId')
  return c.json({ error: `Query "${name}" not implemented — Era 1 sprint 3` }, 501)
})

// --- Internal (n8n → API) ---

app.get('/api/internal/creds', async (c) => {
  // TODO: rota interna pra n8n buscar credenciais decriptadas
  //       Requer shared secret em header X-Internal-Key
  return c.json({ error: 'Not implemented — Era 1 sprint 2' }, 501)
})

// 404 fallback
app.notFound((c) => {
  return c.json({ error: `Route not found: ${c.req.method} ${c.req.path}` }, 404)
})

// Entrypoint Node.js (substituiu export default app do CF Worker)
const port = parseInt(process.env.PORT || '3000')
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`tracking-api listening on http://localhost:${info.port}`)
})
