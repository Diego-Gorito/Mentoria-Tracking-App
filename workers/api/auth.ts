// auth.ts — Hono router /api/auth/*
// Routes: POST /signup, POST /login, POST /magic-link
// LGPD: user_id em logs, NUNCA email.
// bcrypt cost=10 (bcryptjs pure JS — sem native bindings, Docker alpine safe).

import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'node:crypto'
import { query, queryOne, queryTx } from './db'
import { signToken } from './jwt'

const BCRYPT_COST = 10
const MAGIC_LINK_TTL_MINS = 15

// --- Validadores ---

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function isValidPassword(v: string): boolean {
  return typeof v === 'string' && v.length >= 8
}

function isValidSlug(v: string): boolean {
  return /^[a-z0-9-]+$/.test(v)
}

// --- Tipos internos ---

type UserRow = {
  user_id: string
  email: string
  password_hash: string
}

type TenantRow = {
  tenant_id: string
  slug: string
  name: string
  onboarding_step: number
}

type TenantUserRow = {
  tenant_id: string
  role: string
}

// --- Helpers ---

async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[auth] RESEND_API_KEY nao configurado — magic-link nao enviado')
    return
  }
  const url = `https://tracking.colegiomentoria.com.br/auth/verify?token=${token}`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'tracking@escola.click',
      to: email,
      subject: 'Seu link de acesso — Mentoria Tracking',
      html: `
        <p>Ola,</p>
        <p>Clique no link abaixo para acessar sua conta Mentoria Tracking:</p>
        <p><a href="${url}">${url}</a></p>
        <p>O link expira em ${MAGIC_LINK_TTL_MINS} minutos.</p>
        <p>Se voce nao solicitou este link, ignore este e-mail.</p>
      `,
    }),
  })
}

// --- Router ---

const authRouter = new Hono()

// POST /signup
// Body: { email, password, name, tenant_slug }
authRouter.post('/signup', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body JSON invalido' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const tenantSlug = typeof body.tenant_slug === 'string' ? body.tenant_slug.trim() : ''

  // Validações
  if (!isValidEmail(email)) return c.json({ error: 'E-mail invalido' }, 422)
  if (!isValidPassword(password)) return c.json({ error: 'Senha deve ter no minimo 8 caracteres' }, 422)
  if (!name) return c.json({ error: 'Nome e obrigatorio' }, 422)
  if (tenantSlug && !isValidSlug(tenantSlug)) {
    return c.json({ error: 'Slug invalido (use apenas letras minusculas, numeros e hifens)' }, 422)
  }

  // Checar email duplicado
  const existing = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM core.users WHERE email = $1',
    [email],
  )
  if (existing) {
    return c.json({ error: 'E-mail ja cadastrado' }, 409)
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  const slug = tenantSlug || email.split('@')[0].replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

  try {
    const result = await queryTx(async (client) => {
      // 1. Criar user
      const userRows = await client.query<UserRow>(
        `INSERT INTO core.users (email, password_hash)
         VALUES ($1, $2)
         RETURNING user_id, email`,
        [email, passwordHash],
      )
      const user = userRows.rows[0]

      // 2. Resolver ou criar tenant
      let tenantRow = (
        await client.query<TenantRow>(
          'SELECT tenant_id, slug, name, onboarding_step FROM core.tenants WHERE slug = $1',
          [slug],
        )
      ).rows[0]

      if (!tenantRow) {
        const tenantRows = await client.query<TenantRow>(
          `INSERT INTO core.tenants (slug, name, plan, status, onboarding_step)
           VALUES ($1, $2, 'free', 'active', 0)
           RETURNING tenant_id, slug, name, onboarding_step`,
          [slug, name || slug],
        )
        tenantRow = tenantRows.rows[0]
      }

      // 3. Associar user ao tenant como owner
      await client.query(
        `INSERT INTO core.tenant_users (tenant_id, user_id, role, accepted_at)
         VALUES ($1, $2, 'owner', now())
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [tenantRow.tenant_id, user.user_id],
      )

      return { user, tenant: tenantRow }
    })

    const token = await signToken({
      sub: result.user.user_id,
      email: result.user.email,
      tenant_slug: result.tenant.slug,
      role: 'owner',
    })

    // LGPD: log apenas user_id
    console.log(`[auth] signup ok user_id=${result.user.user_id} tenant=${result.tenant.slug}`)

    return c.json({
      user_id: result.user.user_id,
      email: result.user.email,
      tenant_slug: result.tenant.slug,
      tenant_name: result.tenant.name,
      role: 'owner',
      onboarding_step: result.tenant.onboarding_step,
      token,
    }, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return c.json({ error: 'E-mail ja cadastrado' }, 409)
    }
    console.error('[auth] signup error:', msg)
    return c.json({ error: 'Erro interno ao criar conta' }, 500)
  }
})

// POST /login
// Body: { email, password }
authRouter.post('/login', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body JSON invalido' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return c.json({ error: 'E-mail e senha sao obrigatorios' }, 422)
  }

  const user = await queryOne<UserRow>(
    'SELECT user_id, email, password_hash FROM core.users WHERE email = $1',
    [email],
  )

  // Comparar mesmo se user nao existe (evita timing attack)
  const dummyHash = '$2b$10$invalidhashpaddingtomitigatetimingattackXXXXXXXXXXXXX'
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? dummyHash)

  if (!user || !passwordOk) {
    return c.json({ error: 'E-mail ou senha incorretos' }, 401)
  }

  // Buscar tenant_user associado (primeiro, Era 1)
  const tu = await queryOne<TenantUserRow & TenantRow>(
    `SELECT tu.tenant_id, tu.role, t.slug, t.name, t.onboarding_step
     FROM core.tenant_users tu
     JOIN core.tenants t ON t.tenant_id = tu.tenant_id
     WHERE tu.user_id = $1
     ORDER BY tu.accepted_at ASC
     LIMIT 1`,
    [user.user_id],
  )

  // Atualizar last_login_at (best-effort, sem bloquear resposta)
  query(
    'UPDATE core.users SET last_login_at = now() WHERE user_id = $1',
    [user.user_id],
  ).catch((err) => console.error('[auth] last_login_at update error:', err.message))

  const token = await signToken({
    sub: user.user_id,
    email: user.email,
    tenant_slug: tu?.slug,
    role: tu?.role,
  })

  console.log(`[auth] login ok user_id=${user.user_id}`)

  return c.json({
    user_id: user.user_id,
    email: user.email,
    tenant_slug: tu?.slug ?? null,
    tenant_name: tu?.name ?? null,
    role: tu?.role ?? null,
    onboarding_step: tu?.onboarding_step ?? 0,
    token,
  })
})

// POST /magic-link
// Body: { email }
// Responde 200 SEMPRE (nao expor se email existe — LGPD).
authRouter.post('/magic-link', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ sent: true }) // responde 200 mesmo com body inválido
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!isValidEmail(email)) {
    return c.json({ sent: true }) // silently fail — nao vazar existência
  }

  const user = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM core.users WHERE email = $1',
    [email],
  )

  if (user) {
    // Gerar token aleatório (32 bytes hex = 64 chars)
    const tokenRaw = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(tokenRaw).digest('hex')
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINS * 60 * 1000)

    // Upsert magic link (cria tabela se necessário — Dara migra formalmente)
    await query(
      `INSERT INTO core.magic_links (user_id, token_hash, expires_at, used_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (user_id) DO UPDATE
         SET token_hash = EXCLUDED.token_hash,
             expires_at = EXCLUDED.expires_at,
             used_at = NULL`,
      [user.user_id, tokenHash, expiresAt.toISOString()],
    ).catch(async () => {
      // Tabela pode nao existir ainda — criar inline
      await query(`
        CREATE TABLE IF NOT EXISTS core.magic_links (
          user_id   uuid PRIMARY KEY REFERENCES core.users(user_id) ON DELETE CASCADE,
          token_hash text NOT NULL,
          expires_at timestamptz NOT NULL,
          used_at    timestamptz
        )`)
      await query(
        `INSERT INTO core.magic_links (user_id, token_hash, expires_at, used_at)
         VALUES ($1, $2, $3, NULL)
         ON CONFLICT (user_id) DO UPDATE
           SET token_hash = EXCLUDED.token_hash,
               expires_at = EXCLUDED.expires_at,
               used_at = NULL`,
        [user.user_id, tokenHash, expiresAt.toISOString()],
      )
    })

    // Enviar email (best-effort)
    sendMagicLinkEmail(email, tokenRaw).catch((err) =>
      console.error('[auth] magic-link send error:', err.message),
    )

    console.log(`[auth] magic-link gerado user_id=${user.user_id}`)
  }

  // Sempre 200 — nao expor se email existe
  return c.json({ sent: true })
})

export default authRouter
