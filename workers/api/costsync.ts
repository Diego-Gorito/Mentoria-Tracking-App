// workers/api/costsync.ts
// Orquestrador do sync de CUSTO de ad platforms → tracking.campaigns.cost_cents.
// READ-ONLY: só lê spend/insights via providers; nunca cria/publica campanha.
// @see docs/adr-0011 §5b
//
// Itera as contas conectadas (tracking.ad_accounts) do tenant, resolve a credencial
// e o provider da plataforma, puxa o custo e faz upsert idempotente. Plataforma sem
// provider ou sem credencial é PULADA (registrada em byPlatform[x].error) — o sync
// nunca quebra por falta de uma plataforma.

import { Hono } from 'hono'
import { supabaseAdmin } from './db'
import { authMiddleware, getAuthCtx } from './middleware'
import { getCostProvider, supportedCostPlatforms } from '../lib/costsync/registry'
import type { AdAccountConn, CostSyncResult } from '../lib/costsync/types'

// Tenant do Diego (Colégio Mentoria) — único que usa o System User Token do .env.
// Guarda anti-vazamento: o token do .env NUNCA é usado pra outro tenant.
// SaaS: cada tenant terá seu token cifrado em core.tenant_integrations_meta.
const MENTORIA_TENANT_ID = '93031821-455e-490b-92c9-1ccbebf1b30f'

/** Resolve a credencial (token) pra uma plataforma+tenant. null = não conectado. */
function resolveCredential(platform: string, tenantId: string): string | null {
  if (platform === 'meta' && tenantId === MENTORIA_TENANT_ID) {
    return process.env.META_SYSTEM_USER_TOKEN ?? null
  }
  // TODO SaaS: resolver por tenant via core.tenant_integrations_meta (decrypt libsodium).
  return null
}

interface AdAccountRow {
  tenant_id: string
  brand_slug: string | null
  platform: string
  external_account_id: string
}

/** Sincroniza o custo de todas as contas conectadas de um tenant. READ-ONLY. */
export async function runCostSync(
  tenantId: string,
  datePreset = 'last_30d',
): Promise<CostSyncResult> {
  const result: CostSyncResult = {
    tenantId,
    accountsProcessed: 0,
    accountsSkipped: 0,
    campaignsUpserted: 0,
    byPlatform: {},
  }

  const { data: accounts, error } = await supabaseAdmin
    .schema('tracking')
    .from('ad_accounts')
    .select('tenant_id,brand_slug,platform,external_account_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'connected')

  if (error) throw new Error(`ad_accounts query failed: ${error.message}`)

  for (const acct of (accounts ?? []) as AdAccountRow[]) {
    const platform = acct.platform
    if (!result.byPlatform[platform]) {
      result.byPlatform[platform] = { accounts: 0, campaigns: 0, costCents: 0 }
    }
    const bucket = result.byPlatform[platform]

    const provider = getCostProvider(platform)
    const credential = resolveCredential(platform, tenantId)
    if (!provider || !credential) {
      result.accountsSkipped++
      bucket.error = !provider ? 'no_provider' : 'no_credential'
      continue
    }

    const conn: AdAccountConn = {
      tenantId: acct.tenant_id,
      brandSlug: acct.brand_slug,
      platform,
      externalAccountId: acct.external_account_id,
      credential,
    }

    try {
      const costs = await provider.fetchCampaignCosts(conn, { datePreset })
      for (const c of costs) {
        const { error: upErr } = await supabaseAdmin
          .schema('tracking')
          .rpc('upsert_campaign_cost', {
            p_tenant: conn.tenantId,
            p_brand: conn.brandSlug,
            p_platform: platform,
            p_account_id: c.accountId,
            p_external_campaign_id: c.externalCampaignId,
            p_campaign_name: c.campaignName,
            p_cost_cents: c.costCents,
            p_currency: c.currency,
          })
        if (upErr) throw new Error(upErr.message)
        bucket.campaigns++
        bucket.costCents += c.costCents
        result.campaignsUpserted++
      }
      bucket.accounts++
      result.accountsProcessed++

      await supabaseAdmin
        .schema('tracking')
        .from('ad_accounts')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('tenant_id', conn.tenantId)
        .eq('platform', platform)
        .eq('external_account_id', conn.externalAccountId)
    } catch (e) {
      result.accountsSkipped++
      bucket.error = e instanceof Error ? e.message : 'sync_failed'
    }
  }

  return result
}

/** Sincroniza TODOS os tenants com contas conectadas. Usado pelo cron. */
export async function runCostSyncAllTenants(datePreset = 'last_30d') {
  const { data, error } = await supabaseAdmin
    .schema('tracking')
    .from('ad_accounts')
    .select('tenant_id')
    .eq('status', 'connected')
  if (error) throw new Error(`ad_accounts query failed: ${error.message}`)
  const tenantIds = [...new Set((data ?? []).map((r) => (r as { tenant_id: string }).tenant_id))]
  const results: CostSyncResult[] = []
  for (const t of tenantIds) results.push(await runCostSync(t, datePreset))
  return {
    tenants: tenantIds.length,
    campaignsUpserted: results.reduce((s, r) => s + r.campaignsUpserted, 0),
    results,
  }
}

const costSyncRouter = new Hono()

// POST /api/cost-sync/run — dispara o sync READ-ONLY pro tenant logado.
// body opcional: { "date_preset": "last_30d" | "last_7d" | "maximum" | ... }
costSyncRouter.post('/run', authMiddleware, async (c) => {
  const ctx = getAuthCtx(c)
  const body = (await c.req.json().catch(() => ({}))) as { date_preset?: unknown }
  const datePreset = typeof body.date_preset === 'string' ? body.date_preset : 'last_30d'
  const result = await runCostSync(ctx.tenantId, datePreset)
  return c.json(result)
})

// GET /api/cost-sync/platforms — status: plataformas suportadas + contas conectadas.
// Alimenta a UI de canais (#74): mostra o que está conectado vs disponível.
costSyncRouter.get('/platforms', authMiddleware, async (c) => {
  const ctx = getAuthCtx(c)
  const { data: accounts } = await supabaseAdmin
    .schema('tracking')
    .from('ad_accounts')
    .select('platform,external_account_id,account_name,status,last_synced_at')
    .eq('tenant_id', ctx.tenantId)
  return c.json({ supported: supportedCostPlatforms(), connected: accounts ?? [] })
})

// POST /api/cost-sync/cron/run — pro cron (n8n). Auth via X-Internal-Key, sem JWT.
// Sincroniza todos os tenants conectados de uma vez.
costSyncRouter.post('/cron/run', async (c) => {
  const key = c.req.header('X-Internal-Key')
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const body = (await c.req.json().catch(() => ({}))) as { date_preset?: unknown }
  const datePreset = typeof body.date_preset === 'string' ? body.date_preset : 'last_30d'
  const result = await runCostSyncAllTenants(datePreset)
  return c.json(result)
})

export default costSyncRouter
