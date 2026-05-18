// Cloudflare Worker — Mentoria Tracking API
// Hono router. Stubs 501 pra todas as rotas não-implementadas.
// TODO: implementar auth, tenant CRUD, credentials vault, query whitelist (Era 1 sprints 1-3)

import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  ENVIRONMENT: string
  // TODO: adicionar bindings quando implementar (Era 1)
  // DB: Hyperdrive  — connection pool pra Postgres KV2
  // VAULT_KEY: string — pgcrypto master key (CF Secret)
  // JWT_SECRET: string — HS256 signing key (CF Secret)
  // RESEND_API_KEY: string — magic link emails (CF Secret)
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS — permite same-origin em prod, localhost em dev
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*'
      if (origin.includes('localhost')) return origin
      if (origin.includes('tracking.escola.click')) return origin
      if (origin.includes('pages.dev')) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

// --- Health ---

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', env: c.env.ENVIRONMENT, ts: new Date().toISOString() })
})

// --- Auth ---

app.post('/api/auth/signup', async (c) => {
  // TODO: validar email/password, criar user no KV2, retornar JWT
  // Ref: vai-ser-um-produto-logical-candy.md §Auth opção A
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
  // Usado por useTenantFromHostname antes do login
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
  // meta_capi: GET /debug_token, hotmart: ping, etc.
  const platform = c.req.param('platform')
  return c.json({
    error: `Test not implemented for platform "${platform}" — Era 1 sprint 2`,
  }, 501)
})

// --- Query whitelist runner ---

app.post('/api/query/:name', async (c) => {
  // TODO: whitelist de queries permitidas (kpi_summary, funnel_daily, roas_by_platform, etc.)
  //       SET LOCAL app.current_school_id = tenantId antes de executar
  const name = c.req.param('name')
  const _tenantId = c.req.query('tenantId')
  return c.json({
    error: `Query "${name}" not implemented — Era 1 sprint 3`,
  }, 501)
})

// --- Internal (n8n → Worker) ---

app.get('/api/internal/creds', async (c) => {
  // TODO: rota interna pra n8n buscar credenciais decriptadas
  //       Requer shared secret em header X-Internal-Key
  //       Ref: vai-ser-um-produto-logical-candy.md §Camada de credenciais
  return c.json({ error: 'Not implemented — Era 1 sprint 2' }, 501)
})

// 404 fallback
app.notFound((c) => {
  return c.json({ error: `Route not found: ${c.req.method} ${c.req.path}` }, 404)
})

export default app
