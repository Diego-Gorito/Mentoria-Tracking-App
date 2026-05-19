// analytics.ts — Hono router /api/analytics/*
// Multi-tenant: school_id SEMPRE resolvido server-side via tenant_slug do JWT.
// LGPD: email/phone mascarados (usa analytics.leads_quentes_safe_mv).
// Era 1 sprint 3.

import { Hono } from 'hono'
import type { JwtPayload } from './jwt'
import { authMiddleware, getJwtUser } from './middleware'
import { query, queryOne } from './db'

// Typed Hono variables para este router
type AnalyticsVars = { jwtUser: JwtPayload; schoolId: string }

// --- schoolId cache (evita query a cada request) ---

type CacheEntry = { schoolId: string; exp: number }
const schoolIdCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

export async function resolveSchoolId(tenantSlug: string): Promise<string | null> {
  const cached = schoolIdCache.get(tenantSlug)
  if (cached && cached.exp > Date.now()) return cached.schoolId

  const row = await queryOne<{ school_id: string }>(
    'SELECT school_id FROM core.schools WHERE slug = $1',
    [tenantSlug],
  )
  if (!row?.school_id) return null

  schoolIdCache.set(tenantSlug, { schoolId: row.school_id, exp: Date.now() + CACHE_TTL_MS })
  return row.school_id
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
  const jwt = getJwtUser(c)
  const slug = jwt.tenant_slug
  if (!slug) return c.json({ error: 'tenant_slug ausente no token' }, 403)

  const schoolId = await resolveSchoolId(slug)
  if (!schoolId) return c.json({ error: 'tenant_not_provisioned' }, 404)

  c.set('schoolId', schoolId)
  await next()
})

// --- GET /api/analytics/summary?period=7d|30d|90d ---
// 6 KPI cards: leads, conversions, spend, ROAS, CPL, dispatch health.

analyticsRouter.get('/summary', async (c) => {
  const schoolId = c.get('schoolId') as string
  const days = periodDays(c.req.query('period'))
  const interval = intervalExpr(days)
  const prevInterval = intervalExpr(days * 2)

  // Leads totais + delta
  type LeadsRow = { leads_total: string; leads_prev: string }
  const leadsRow = await queryOne<LeadsRow>(
    `SELECT
       COUNT(*) FILTER (WHERE first_seen_at > now() - interval '${interval}')::text AS leads_total,
       COUNT(*) FILTER (WHERE first_seen_at BETWEEN now() - interval '${prevInterval}' AND now() - interval '${interval}')::text AS leads_prev
     FROM core.leads
     WHERE school_id = $1::uuid`,
    [schoolId],
  )

  const leadsTotal = parseInt(leadsRow?.leads_total ?? '0', 10)
  const leadsPrev = parseInt(leadsRow?.leads_prev ?? '0', 10)
  const leadsDeltaPct = leadsPrev > 0 ? ((leadsTotal - leadsPrev) / leadsPrev) * 100 : 0

  // Conversions + revenue
  type ConvRow = { conv_total: string; value_sum: string }
  const convRow = await queryOne<ConvRow>(
    `SELECT
       COUNT(*)::text AS conv_total,
       COALESCE(SUM(value_cents), 0)::text AS value_sum
     FROM core.conversions
     WHERE school_id = $1::uuid
       AND status = 'completed'
       AND occurred_at > now() - interval '${interval}'`,
    [schoolId],
  )
  const convTotal = parseInt(convRow?.conv_total ?? '0', 10)
  const valueCents = parseInt(convRow?.value_sum ?? '0', 10)
  const valueBrl = valueCents / 100

  // Spend (cost_brl soma das campanhas no período)
  type SpendRow = { spend_sum: string }
  const spendRow = await queryOne<SpendRow>(
    `SELECT COALESCE(SUM(cost_brl), 0)::text AS spend_sum
     FROM analytics.roi_por_campanha
     WHERE school_id = $1::uuid`,
    [schoolId],
  )
  const spendBrl = parseFloat(spendRow?.spend_sum ?? '0')

  const roas = spendBrl > 0 ? valueBrl / spendBrl : 0
  const cplBrl = leadsTotal > 0 ? spendBrl / leadsTotal : 0

  // Dispatch health (últimas 24h)
  type DispRow = { total: string; sent: string }
  const dispRow = await queryOne<DispRow>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE cd.status = 'sent')::text AS sent
     FROM core.conversion_dispatches cd
     JOIN core.conversions cv ON cv.conversion_id = cd.conversion_id
     WHERE cv.school_id = $1::uuid
       AND cd.created_at > now() - interval '24 hours'`,
    [schoolId],
  )
  const dispTotal = parseInt(dispRow?.total ?? '0', 10)
  const dispSent = parseInt(dispRow?.sent ?? '0', 10)
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
// Funil diário a partir de analytics.funil_diario.

analyticsRouter.get('/funnel', async (c) => {
  const schoolId = c.get('schoolId') as string
  const days = periodDays(c.req.query('period'))

  type FunnelRow = {
    day: string
    sessions: string
    new_leads: string
    qualified_today: string
    app_purchases: string
    escola_matriculas: string
  }

  const rows = await query<FunnelRow>(
    `SELECT
       day::text,
       sessions::text,
       new_leads::text,
       qualified_today::text,
       app_purchases::text,
       escola_matriculas::text
     FROM analytics.funil_diario
     WHERE school_id = $1::uuid
       AND day >= (now() - interval '${intervalExpr(days)}')::date
     ORDER BY day ASC`,
    [schoolId],
  )

  return c.json({
    data: rows.map((r) => ({
      day: r.day,
      sessions: parseInt(r.sessions, 10),
      leads: parseInt(r.new_leads, 10),
      mql: parseInt(r.qualified_today, 10),
      conversions: parseInt(r.app_purchases, 10) + parseInt(r.escola_matriculas, 10),
    })),
  })
})

// --- GET /api/analytics/roi-platforms?period=30d ---
// ROAS por plataforma (agregação de analytics.roi_por_campanha por platform).

analyticsRouter.get('/roi-platforms', async (c) => {
  const schoolId = c.get('schoolId') as string

  type RoiRow = {
    platform: string
    spend_sum: string
    conv_sum: string
    revenue_sum: string
  }

  const rows = await query<RoiRow>(
    `SELECT
       COALESCE(platform, utm_source, 'outros') AS platform,
       COALESCE(SUM(cost_brl), 0)::text AS spend_sum,
       COALESCE(SUM(total_conversions), 0)::text AS conv_sum,
       COALESCE(SUM(revenue_brl), 0)::text AS revenue_sum
     FROM analytics.roi_por_campanha
     WHERE school_id = $1::uuid
     GROUP BY COALESCE(platform, utm_source, 'outros')
     ORDER BY SUM(revenue_brl) DESC NULLS LAST
     LIMIT 10`,
    [schoolId],
  )

  return c.json({
    data: rows.map((r) => {
      const spendBrl = parseFloat(r.spend_sum)
      const valueBrl = parseFloat(r.revenue_sum)
      const roas = spendBrl > 0 ? Math.round((valueBrl / spendBrl) * 100) / 100 : 0
      return {
        platform: r.platform,
        spend_brl: Math.round(spendBrl * 100) / 100,
        conversions: parseInt(r.conv_sum, 10),
        value_brl: Math.round(valueBrl * 100) / 100,
        roas,
      }
    }),
  })
})

// --- GET /api/analytics/leads-recent?limit=20 ---
// Top leads quentes (LGPD: PII mascarada via MV safe).

analyticsRouter.get('/leads-recent', async (c) => {
  const schoolId = c.get('schoolId') as string
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)

  type LeadRow = {
    lead_id: string
    email_masked: string
    phone_masked: string
    full_name_masked: string
    current_score: number
    first_source: string
    last_event_at: string
    score_tier: string
  }

  const rows = await query<LeadRow>(
    `SELECT
       lead_id,
       COALESCE(email_masked, '***') AS email_masked,
       COALESCE(phone_masked, '') AS phone_masked,
       COALESCE(full_name_masked, 'Anonimo') AS full_name_masked,
       COALESCE(current_score, 0) AS current_score,
       COALESCE(first_source, 'desconhecido') AS first_source,
       last_event_at,
       COALESCE(score_tier, 'low') AS score_tier
     FROM analytics.leads_quentes_safe_mv
     WHERE school_id = $1::uuid
     ORDER BY last_event_at DESC NULLS LAST
     LIMIT $2`,
    [schoolId, limit],
  )

  return c.json({
    data: rows.map((r) => ({
      lead_id: r.lead_id,
      email_mask: r.email_masked,
      phone_mask: r.phone_masked,
      name_mask: r.full_name_masked,
      score: r.current_score,
      source: r.first_source,
      last_event_at: r.last_event_at,
      score_tier: r.score_tier,
    })),
  })
})

// --- GET /api/analytics/dispatches-failed?limit=20 ---
// Dispatches com retry_count >= 3.

analyticsRouter.get('/dispatches-failed', async (c) => {
  const schoolId = c.get('schoolId') as string
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)

  type DispRow = {
    dispatch_id: string
    conversion_id: string
    platform: string
    retry_count: number
    error_message: string
    updated_at: string
    status: string
  }

  const rows = await query<DispRow>(
    `SELECT
       cd.dispatch_id::text,
       cd.conversion_id::text,
       cd.platform,
       cd.retry_count,
       COALESCE(cd.error_message, '') AS error_message,
       cd.updated_at,
       cd.status
     FROM core.conversion_dispatches cd
     JOIN core.conversions cv ON cv.conversion_id = cd.conversion_id
     WHERE cv.school_id = $1::uuid
       AND cd.retry_count >= 3
       AND cd.status = 'failed'
     ORDER BY cd.updated_at DESC
     LIMIT $2`,
    [schoolId, limit],
  )

  return c.json({
    data: rows.map((r) => ({
      dispatch_id: r.dispatch_id,
      conversion_id: r.conversion_id,
      platform: r.platform,
      retry_count: r.retry_count,
      last_error: r.error_message,
      last_attempt_at: r.updated_at,
      status: r.status,
    })),
  })
})

// --- GET /api/analytics/channels?period=30d ---
// Leads por canal (funil diário agrupado por fonte — simplificado: usa new_leads + primeira sessão).
// Nota: ga4_channels_30d usa property_id não school_id; usar funil_diario por ora.

analyticsRouter.get('/channels', async (c) => {
  const schoolId = c.get('schoolId') as string
  const days = periodDays(c.req.query('period'))

  // Agrupa leads por source da view leads_quentes_safe_mv × dia via core.leads
  type ChannelRow = {
    day: string
    source: string
    cnt: string
  }

  const rows = await query<ChannelRow>(
    `SELECT
       date_trunc('day', first_seen_at AT TIME ZONE 'America/Recife')::date::text AS day,
       COALESCE(first_source, 'direto') AS source,
       COUNT(*)::text AS cnt
     FROM core.leads
     WHERE school_id = $1::uuid
       AND first_seen_at > now() - interval '${intervalExpr(days)}'
     GROUP BY 1, 2
     ORDER BY 1 ASC`,
    [schoolId],
  )

  // Pivotear em { day, organic, meta, google, hotmart, direct, outros }
  type DayBucket = Record<string, number>
  const buckets = new Map<string, DayBucket>()

  for (const r of rows) {
    if (!buckets.has(r.day)) {
      buckets.set(r.day, { organic: 0, meta: 0, google: 0, hotmart: 0, direct: 0, outros: 0 })
    }
    const b = buckets.get(r.day)!
    const cnt = parseInt(r.cnt, 10)
    const src = r.source.toLowerCase()

    if (src.includes('organic') || src.includes('organico') || src === 'organic') b.organic += cnt
    else if (src.includes('meta') || src.includes('facebook') || src.includes('instagram')) b.meta += cnt
    else if (src.includes('google')) b.google += cnt
    else if (src.includes('hotmart')) b.hotmart += cnt
    else if (src === 'direct' || src === 'direto' || src === '(direct)') b.direct += cnt
    else b.outros += cnt
  }

  return c.json({
    data: Array.from(buckets.entries()).map(([day, b]) => ({ day, ...b })),
  })
})

export default analyticsRouter
