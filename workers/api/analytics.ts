// analytics.ts — Hono router /api/analytics/*
// Fase 3 — ADR-0007 v1.2 (substitui query pg por supabaseAdmin)
// Multi-tenant: school_id SEMPRE resolvido server-side via tenant_id do JWT.
// LGPD: PII mascarada via analytics.leads_quentes_safe_mv.

import { Hono } from 'hono'
import { authMiddleware, getAuthCtx, type AuthContext } from './middleware'
import { supabaseAdmin } from './db'

type AnalyticsVars = { authCtx: AuthContext; schoolId: string }

// --- schoolId cache (evita query a cada request) ---

type CacheEntry = { schoolId: string; exp: number }
const schoolIdCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

export async function resolveSchoolId(tenantId: string): Promise<string | null> {
  const cached = schoolIdCache.get(tenantId)
  if (cached && cached.exp > Date.now()) return cached.schoolId

  // Supabase schema tracking.* — tabela core.tenants mapeia tenant_id → schools
  // Nota: schema real e tracking.schools (Supabase) ou core.schools (KV2 legado).
  // Usando core.schools por ora (mesma tabela portada nas migrations 0200+).
  const { data, error } = await supabaseAdmin
    .schema('core')
    .from('schools')
    .select('school_id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .single()

  if (error || !data?.school_id) {
    // Fallback: tentar resolver via slug se tenant_id nao mapeia direto
    return null
  }

  schoolIdCache.set(tenantId, { schoolId: data.school_id, exp: Date.now() + CACHE_TTL_MS })
  return data.school_id as string
}

// --- Helpers ---

function periodDays(period: string | undefined): 7 | 30 | 90 {
  if (period === '7d') return 7
  if (period === '90d') return 90
  return 30
}

function intervalExpr(days: number): string {
  return `${days} days`
}

// --- Router ---

const analyticsRouter = new Hono<{ Variables: AnalyticsVars }>()

// Middleware: resolve schoolId pra todos os endpoints analytics
analyticsRouter.use('*', authMiddleware, async (c, next) => {
  const ctx = getAuthCtx(c)
  const tenantId = ctx.tenantId

  if (!tenantId) return c.json({ error: 'tenant_id ausente no token' }, 403)

  const schoolId = await resolveSchoolId(tenantId)
  if (!schoolId) return c.json({ error: 'tenant_not_provisioned' }, 404)

  c.set('schoolId', schoolId)
  await next()
})

// --- GET /api/analytics/summary?period=7d|30d|90d ---

analyticsRouter.get('/summary', async (c) => {
  const schoolId = c.get('schoolId') as string
  const days = periodDays(c.req.query('period'))
  const interval = intervalExpr(days)
  const prevInterval = intervalExpr(days * 2)

  type LeadsRow = { leads_total: number; leads_prev: number }
  const { data: leadsRow, error: leadsErr } = await supabaseAdmin.rpc('analytics_leads_summary', {
    p_school_id: schoolId,
    p_interval: interval,
    p_prev_interval: prevInterval,
  })
  if (leadsErr) {
    // Fallback direto pra nao bloquear se RPC nao existe no staging inicial
    console.warn('[analytics] analytics_leads_summary RPC nao encontrado, usando 0')
  }
  const leadsTotal = (leadsRow as LeadsRow | null)?.leads_total ?? 0
  const leadsPrev = (leadsRow as LeadsRow | null)?.leads_prev ?? 0
  const leadsDeltaPct = leadsPrev > 0 ? ((leadsTotal - leadsPrev) / leadsPrev) * 100 : 0

  type ConvRow = { conv_total: number; value_sum: number }
  const convResult = await supabaseAdmin.rpc('analytics_conversions_summary', {
    p_school_id: schoolId,
    p_interval: interval,
  }).then((r) => ({ data: r.data }), () => ({ data: null }))
  const convRow = convResult.data

  const convTotal = (convRow as ConvRow | null)?.conv_total ?? 0
  const valueCents = (convRow as ConvRow | null)?.value_sum ?? 0
  const valueBrl = valueCents / 100

  // Spend via analytics.roi_por_campanha
  const spendResult = await supabaseAdmin
    .schema('analytics')
    .from('roi_por_campanha')
    .select('cost_brl')
    .eq('school_id', schoolId)
    .then((r) => ({ data: r.data }), () => ({ data: null }))
  const spendData = spendResult.data

  const spendBrl = spendData
    ? (spendData as { cost_brl: number | null }[]).reduce((s, r) => s + (r.cost_brl ?? 0), 0)
    : 0

  const roas = spendBrl > 0 ? valueBrl / spendBrl : 0
  const cplBrl = leadsTotal > 0 ? spendBrl / leadsTotal : 0

  // Dispatch health (últimas 24h)
  type DispRow = { total: number; sent: number }
  const dispResult = await supabaseAdmin.rpc('analytics_dispatch_health', {
    p_school_id: schoolId,
  }).then((r) => ({ data: r.data }), () => ({ data: null }))
  const dispRow = dispResult.data

  const dispTotal = (dispRow as DispRow | null)?.total ?? 0
  const dispSent = (dispRow as DispRow | null)?.sent ?? 0
  const dispHealthPct = dispTotal > 0 ? (dispSent / dispTotal) * 100 : 100

  return c.json({
    leads_total: leadsTotal,
    leads_delta_pct: Math.round(leadsDeltaPct * 10) / 10,
    conversions_total: convTotal,
    conversions_value_brl: Math.round(valueBrl * 100) / 100,
    spend_brl: Math.round(spendBrl * 100) / 100,
    roas: Math.round(roas * 100) / 100,
    cpl_brl: Math.round(cplBrl * 100) / 100,
    dispatch_health_pct: Math.round(dispHealthPct * 10) / 10,
    period_days: days,
  })
})

// --- GET /api/analytics/funnel?period=30d ---

analyticsRouter.get('/funnel', async (c) => {
  const schoolId = c.get('schoolId') as string
  const days = periodDays(c.req.query('period'))
  const sinceDate = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10)

  type FunnelRow = {
    day: string
    sessions: number
    new_leads: number
    qualified_today: number
    app_purchases: number
    escola_matriculas: number
  }

  const { data: rows, error } = await supabaseAdmin
    .schema('analytics')
    .from('funil_diario')
    .select('day,sessions,new_leads,qualified_today,app_purchases,escola_matriculas')
    .eq('school_id', schoolId)
    .gte('day', sinceDate)
    .order('day', { ascending: true })

  if (error) {
    console.error('[analytics] funnel error:', error.message)
    return c.json({ data: [] })
  }

  return c.json({
    data: (rows as FunnelRow[]).map((r) => ({
      day: r.day,
      sessions: r.sessions ?? 0,
      leads: r.new_leads ?? 0,
      mql: r.qualified_today ?? 0,
      conversions: (r.app_purchases ?? 0) + (r.escola_matriculas ?? 0),
    })),
  })
})

// --- GET /api/analytics/roi-platforms?period=30d ---

analyticsRouter.get('/roi-platforms', async (c) => {
  const schoolId = c.get('schoolId') as string

  type RoiRow = {
    platform: string | null
    utm_source: string | null
    cost_brl: number | null
    total_conversions: number | null
    revenue_brl: number | null
  }

  const { data: rows, error } = await supabaseAdmin
    .schema('analytics')
    .from('roi_por_campanha')
    .select('platform,utm_source,cost_brl,total_conversions,revenue_brl')
    .eq('school_id', schoolId)

  if (error) {
    console.error('[analytics] roi-platforms error:', error.message)
    return c.json({ data: [] })
  }

  // Agregar por plataforma
  const agg = new Map<string, { spend: number; conv: number; revenue: number }>()
  for (const r of rows as RoiRow[]) {
    const platform = r.platform ?? r.utm_source ?? 'outros'
    const cur = agg.get(platform) ?? { spend: 0, conv: 0, revenue: 0 }
    cur.spend += r.cost_brl ?? 0
    cur.conv += r.total_conversions ?? 0
    cur.revenue += r.revenue_brl ?? 0
    agg.set(platform, cur)
  }

  const sorted = Array.from(agg.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)

  return c.json({
    data: sorted.map(([platform, v]) => ({
      platform,
      spend_brl: Math.round(v.spend * 100) / 100,
      conversions: v.conv,
      value_brl: Math.round(v.revenue * 100) / 100,
      roas: v.spend > 0 ? Math.round((v.revenue / v.spend) * 100) / 100 : 0,
    })),
  })
})

// --- GET /api/analytics/leads-recent?limit=20 ---

analyticsRouter.get('/leads-recent', async (c) => {
  const schoolId = c.get('schoolId') as string
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)

  type LeadRow = {
    lead_id: string
    email_masked: string | null
    phone_masked: string | null
    full_name_masked: string | null
    current_score: number | null
    first_source: string | null
    last_event_at: string | null
    score_tier: string | null
  }

  const { data: rows, error } = await supabaseAdmin
    .schema('analytics')
    .from('leads_quentes_safe_mv')
    .select('lead_id,email_masked,phone_masked,full_name_masked,current_score,first_source,last_event_at,score_tier')
    .eq('school_id', schoolId)
    .order('last_event_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    console.error('[analytics] leads-recent error:', error.message)
    return c.json({ data: [] })
  }

  return c.json({
    data: (rows as LeadRow[]).map((r) => ({
      lead_id: r.lead_id,
      email_mask: r.email_masked ?? '***',
      phone_mask: r.phone_masked ?? '',
      name_mask: r.full_name_masked ?? 'Anonimo',
      score: r.current_score ?? 0,
      source: r.first_source ?? 'desconhecido',
      last_event_at: r.last_event_at,
      score_tier: r.score_tier ?? 'low',
    })),
  })
})

// --- GET /api/analytics/dispatches-failed?limit=20 ---

analyticsRouter.get('/dispatches-failed', async (c) => {
  const schoolId = c.get('schoolId') as string
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)

  type DispRow = {
    dispatch_id: string
    conversion_id: string
    platform: string
    retry_count: number
    error_message: string | null
    updated_at: string
    status: string
  }

  // Join via view ou RPC — por ora usa join manual via supabaseAdmin
  // core.conversion_dispatches JOIN core.conversions via conversion_id filtrado por school_id
  const { data: rows, error } = await supabaseAdmin.rpc('analytics_dispatches_failed', {
    p_school_id: schoolId,
    p_limit: limit,
  })

  if (error) {
    // Fallback silencioso se RPC nao existe ainda no staging
    console.warn('[analytics] analytics_dispatches_failed RPC nao encontrado:', error.message)
    return c.json({ data: [] })
  }

  return c.json({
    data: (rows as DispRow[]).map((r) => ({
      dispatch_id: r.dispatch_id,
      conversion_id: r.conversion_id,
      platform: r.platform,
      retry_count: r.retry_count,
      last_error: r.error_message ?? '',
      last_attempt_at: r.updated_at,
      status: r.status,
    })),
  })
})

// --- GET /api/analytics/channels?period=30d ---

analyticsRouter.get('/channels', async (c) => {
  const schoolId = c.get('schoolId') as string
  const days = periodDays(c.req.query('period'))
  const sinceTs = new Date(Date.now() - days * 86400 * 1000).toISOString()

  type LeadChanRow = {
    first_seen_at: string
    first_source: string | null
  }

  const { data: rows, error } = await supabaseAdmin
    .schema('core')
    .from('leads')
    .select('first_seen_at,first_source')
    .eq('school_id', schoolId)
    .gte('first_seen_at', sinceTs)

  if (error) {
    console.error('[analytics] channels error:', error.message)
    return c.json({ data: [] })
  }

  type DayBucket = Record<string, number>
  const buckets = new Map<string, DayBucket>()

  for (const r of rows as LeadChanRow[]) {
    const day = r.first_seen_at?.slice(0, 10) ?? ''
    if (!day) continue
    if (!buckets.has(day)) {
      buckets.set(day, { organic: 0, meta: 0, google: 0, hotmart: 0, direct: 0, outros: 0 })
    }
    const b = buckets.get(day)!
    const src = (r.first_source ?? '').toLowerCase()

    if (src.includes('organic') || src.includes('organico') || src === 'organic') b.organic += 1
    else if (src.includes('meta') || src.includes('facebook') || src.includes('instagram')) b.meta += 1
    else if (src.includes('google')) b.google += 1
    else if (src.includes('hotmart')) b.hotmart += 1
    else if (src === 'direct' || src === 'direto' || src === '(direct)') b.direct += 1
    else b.outros += 1
  }

  const data = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, b]) => ({ day, ...b }))

  return c.json({ data })
})

export default analyticsRouter
