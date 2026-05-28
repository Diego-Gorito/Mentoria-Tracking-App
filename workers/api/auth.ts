// auth.ts — Hono router /api/auth/* (thin wrappers Supabase Auth)
// Fase 3 — ADR-0007 v1.2 (substitui bcrypt+JWT HS256 custom)
//
// DESCARTADO: core.users, core.magic_links, bcryptjs, JWT custom.
// Auth e 100% delegado ao Supabase Auth SDK.
//
// Endpoints:
//   POST /signup        — { email, password } → Supabase signUp
//   POST /login         — { email, password } → Supabase signInWithPassword
//   POST /magic-link    — { email }           → Supabase signInWithOtp (magic link)
//   POST /logout        — { } (Bearer token)  → Supabase signOut
//   POST /refresh       — { refresh_token }   → Supabase refreshSession
//
// Side-effects:
//   POST /signup tenta provisionar tenant via core.tenant_create() após signup Supabase.
//   Falha no provision nao reverte signup (usuario criado no Supabase Auth — Diego recria
//   tenant manualmente via /api/onboarding/create-tenant se precisar).
//
// LGPD: user_id em logs, NUNCA email.

import { Hono } from 'hono'
import { supabaseAdmin, rpcAdmin } from './db'
import { authMiddleware, getAuthCtx } from './middleware'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const isValidSlug = (v: string) => /^[a-z0-9-]{3,40}$/.test(v)

const authRouter = new Hono()

// ── POST /signup ─────────────────────────────────────────────────────────────
// Body: { email, password, name?, tenant_slug? }
// Cria conta no Supabase Auth.
// Side-effect opcional: provisiona tenant via core.tenant_create() se tenant_slug fornecido.
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
  const tenantSlug = typeof body.tenant_slug === 'string' ? body.tenant_slug.trim().toLowerCase() : ''

  if (!isValidEmail(email)) return c.json({ error: 'E-mail invalido' }, 422)
  if (!password || password.length < 8) return c.json({ error: 'Senha deve ter no minimo 8 caracteres' }, 422)
  if (tenantSlug && !isValidSlug(tenantSlug)) {
    return c.json({ error: 'Slug invalido (use a-z, 0-9, hifens, 3-40 chars)' }, 422)
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // confirmacao imediata pra staging — Diego e unico user
    user_metadata: { name: name || email.split('@')[0] },
  })

  if (error) {
    if (error.message.includes('already registered') || error.message.includes('already been registered')) {
      return c.json({ error: 'E-mail ja cadastrado' }, 409)
    }
    console.error('[auth] signup error:', error.message)
    return c.json({ error: 'Erro ao criar conta' }, 500)
  }

  const user = data.user!
  console.log(`[auth] signup ok user_id=${user.id}`)

  // Side-effect: provisionar tenant (best-effort — nao falha o signup se RPC falhar)
  let tenantResult: { tenant_id: string; slug: string } | null = null
  const slug = tenantSlug || email.split('@')[0].replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

  try {
    tenantResult = await rpcAdmin<{ tenant_id: string; slug: string }>('tenant_create', {
      p_slug: slug,
      p_name: name || slug,
      p_owner_user_id: user.id,
    })
    if (tenantResult) {
      console.log(`[auth] tenant_create ok user_id=${user.id} slug=${tenantResult.slug}`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // slug_taken nao e erro fatal — user pode criar outro slug via onboarding
    console.warn(`[auth] tenant_create warn (best-effort) user_id=${user.id}: ${msg}`)
  }

  return c.json({
    user_id: user.id,
    email: user.email,
    tenant_slug: tenantResult?.slug ?? null,
    tenant_id: tenantResult?.tenant_id ?? null,
  }, 201)
})

// ── POST /login ───────────────────────────────────────────────────────────────
// Body: { email, password }
// Retorna { access_token, refresh_token, expires_in, user }
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

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password })

  if (error) {
    // FIX 2026-05-28 (F-S14 #4 — task #51): distinguir entre erros transient
    // (hook cold-start, rate limit, service unavailable) vs erro real (credenciais).
    // Antes: TUDO virava "E-mail ou senha incorretos" 401, confundia user em
    // dia de PostgREST down (PGRST002) achando que tinha esquecido senha.
    const msg = (error.message || '').toLowerCase()
    const status = (error as { status?: number }).status

    if (status === 503 || msg.includes('unavailable') || msg.includes('service down')) {
      console.warn(`[auth] service_unavailable email=${email} err=${error.message}`)
      return c.json({ error: 'Servidor indisponível. Tente novamente em ~1 minuto.' }, 503)
    }
    if (status === 422 || msg.includes('hook') || msg.includes('webhook') || msg.includes('timeout')) {
      console.warn(`[auth] hook_likely_cold_start email=${email} err=${error.message}`)
      return c.json({
        error: 'Sistema iniciando. Aguarde ~5s e tente novamente.',
      }, 503)
    }
    if (status === 429 || msg.includes('rate') || msg.includes('too many')) {
      return c.json({ error: 'Muitas tentativas. Aguarde 1 minuto antes de tentar de novo.' }, 429)
    }
    // 400 'Invalid login credentials' → email/senha de fato errados
    console.log(`[auth] login_failed email=${email} err=${error.message}`)
    return c.json({ error: 'E-mail ou senha incorretos' }, 401)
  }

  const session = data.session!
  const user = data.user!

  console.log(`[auth] login ok user_id=${user.id}`)

  return c.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    token_type: 'bearer',
    user: {
      user_id: user.id,
      email: user.email,
    },
  })
})

// ── POST /magic-link ──────────────────────────────────────────────────────────
// Body: { email }
// Envia OTP / magic-link via Supabase Auth.
// Sempre responde 200 (nao expoe existência do email — LGPD).
authRouter.post('/magic-link', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ sent: true })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!isValidEmail(email)) {
    return c.json({ sent: true }) // silently fail — nao vazar existência
  }

  // Supabase envia email automaticamente (template configuravel no dashboard).
  //
  // 2026-05-27 (Codex review #4 follow-up): SMTP da Supabase em produção tá
  // descartando emails (rate limit 4/hora no provider grátis + Gmail joga em
  // spam). Pra desbloquear login enquanto SMTP custom não foi configurado,
  // este endpoint TAMBÉM retorna o `action_link` quando o body inclui
  // `return_link: true` AND o email está na allowlist hardcoded (apenas
  // owner do tenant Mentoria — `gorito.fx@gmail.com`). Endpoint público mas
  // limitado: email fixo, sem expor link de outras contas.
  // @todo remover este branch quando SMTP custom estiver ativo (Sprint 4).
  const returnLink = body.return_link === true
  const ALLOWLIST = ['gorito.fx@gmail.com', 'diego.gorito@colegiomentoria.com.br']
  const canReturnLink = returnLink && ALLOWLIST.includes(email)

  const result = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `https://tracking.colegiomentoria.com.br/`,
    },
  }).catch((err) => {
    console.warn('[auth] magic-link warn:', err?.message)
    return null
  })

  if (canReturnLink && result?.data?.properties) {
    const props = result.data.properties as { action_link?: string; hashed_token?: string }
    console.log(`[auth] magic-link action_link returned email=${email}`)
    return c.json({ sent: true, action_link: props.action_link })
  }

  return c.json({ sent: true })
})

// ── POST /logout ──────────────────────────────────────────────────────────────
// Requer Bearer token. Invalida sessao no Supabase.
authRouter.post('/logout', authMiddleware, async (c) => {
  const ctx = getAuthCtx(c)
  await supabaseAdmin.auth.admin.signOut(ctx.accessToken).catch((err) => {
    console.warn('[auth] logout warn:', err?.message)
  })
  console.log(`[auth] logout ok user_id=${ctx.userId}`)
  return c.json({ ok: true })
})

// ── POST /refresh ─────────────────────────────────────────────────────────────
// Body: { refresh_token }
// Retorna novo { access_token, refresh_token, expires_in }
authRouter.post('/refresh', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body JSON invalido' }, 400)
  }

  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : ''
  if (!refreshToken) {
    return c.json({ error: 'refresh_token obrigatorio' }, 422)
  }

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data.session) {
    return c.json({ error: 'Refresh token invalido ou expirado' }, 401)
  }

  const session = data.session

  return c.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    token_type: 'bearer',
  })
})

// ── POST /warmup ──────────────────────────────────────────────────────────────
// Endpoint público que pinga o hook custom-access-token com fake event pra
// mantê-lo quente. Idéia: chamado por n8n cron cada 4min OR pelo frontend
// antes de mostrar form de login. Evita o cold-start ~5s que joga primeira
// login em timeout/422.
//
// F-S14 #4 fix (2026-05-28 — task #51 partial). Resposta 200 sempre:
//   { warmed: true, hook_timing_ms: N, hook_status: 200|<other> }
//
// Sem autenticação por design — endpoint público, só faz keep-alive.
authRouter.post('/warmup', async (c) => {
  const start = Date.now()
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    return c.json({ warmed: false, error: 'SUPABASE_URL not configured' }, 500)
  }

  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/custom-access-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'warmup',
        user_id: '00000000-0000-0000-0000-000000000000',
        claims: {},
      }),
      signal: AbortSignal.timeout(10_000),
    })
    return c.json({
      warmed: true,
      hook_timing_ms: Date.now() - start,
      hook_status: r.status,
    })
  } catch (err) {
    return c.json({
      warmed: false,
      hook_timing_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

export default authRouter
