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
import { sealDecrypt } from '../lib/storage/crypto'
import type { AdAccountConn, CostSyncResult } from '../lib/costsync/types'

/**
 * Decifra o token de uma conta (libsodium sealed_box) com as keys do servidor.
 * O token cifrado vive em tracking.ad_accounts.token_encrypted, isolado por tenant
 * (RLS). NUNCA há token em plaintext no banco nem token global no env — cada escola
 * tem o seu, cifrado em repouso. @see docs/adr-0011 §5b.
 */
async function decryptAccountToken(tokenEncrypted: string): Promise<string> {
  const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY
  const sec = process.env.STORAGE_ENCRYPTION_SECRET_KEY
  if (!pub || !sec) throw new Error('STORAGE_ENCRYPTION keys ausentes no env')
  return sealDecrypt(tokenEncrypted, pub, sec)
}

interface AdAccountRow {
  tenant_id: string
  brand_slug: string | null
  platform: string
  external_account_id: string
  token_encrypted: string | null
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
    .select('tenant_id,brand_slug,platform,external_account_id,token_encrypted')
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
    if (!provider) {
      result.accountsSkipped++
      bucket.error = 'no_provider'
      continue
    }
    if (!acct.token_encrypted) {
      result.accountsSkipped++
      bucket.error = 'no_credential'
      continue
    }
    let credential: string
    try {
      credential = await decryptAccountToken(acct.token_encrypted)
    } catch {
      result.accountsSkipped++
      bucket.error = 'decrypt_failed'
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

/** Sincroniza TODOS os tenants com contas conectadas + grava auditoria. Usado pelo cron. */
export async function runCostSyncAllTenants(datePreset = 'last_30d', trigger = 'cron') {
  const startedAt = new Date().toISOString()
  try {
    const { data, error } = await supabaseAdmin
      .schema('tracking')
      .from('ad_accounts')
      .select('tenant_id')
      .eq('status', 'connected')
    if (error) throw new Error(`ad_accounts query failed: ${error.message}`)
    const tenantIds = [...new Set((data ?? []).map((r) => (r as { tenant_id: string }).tenant_id))]
    const results: CostSyncResult[] = []
    for (const t of tenantIds) results.push(await runCostSync(t, datePreset))
    const summary = {
      tenants: tenantIds.length,
      campaignsUpserted: results.reduce((s, r) => s + r.campaignsUpserted, 0),
      results,
    }
    // Auditoria (sem PII/token) — detail leva o byPlatform com erros (decrypt_failed etc).
    await supabaseAdmin.schema('tracking').from('cost_sync_runs').insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      trigger,
      tenants: summary.tenants,
      campaigns_upserted: summary.campaignsUpserted,
      ok: true,
      detail: {
        byTenant: results.map((r) => ({
          tenant: r.tenantId,
          processed: r.accountsProcessed,
          skipped: r.accountsSkipped,
          byPlatform: r.byPlatform,
        })),
      },
    })
    return summary
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabaseAdmin
      .schema('tracking')
      .from('cost_sync_runs')
      .insert({ started_at: startedAt, finished_at: new Date().toISOString(), trigger, ok: false, error: msg })
      .then(
        () => {},
        () => {},
      )
    throw e
  }
}

/**
 * Cron INTERNO: dispara o sync de custo periodicamente (read-only). Não depende de
 * chamador externo nem expõe a internal key. 1ª execução ~2min após boot (deixa o
 * serviço estabilizar), depois a cada `intervalMs`. Idempotente (upsert) — réplicas
 * múltiplas não corrompem dado, no máximo repetem a leitura. @see docs/adr-0011 §5b.
 */
let costSyncTimer: ReturnType<typeof setInterval> | null = null
export function startCostSyncScheduler(intervalMs = 6 * 60 * 60 * 1000): void {
  if (process.env.NODE_ENV === 'test' || costSyncTimer) return
  const run = () =>
    runCostSyncAllTenants('last_30d')
      .then((r) =>
        console.log(`[cost-sync] ${r.tenants} tenant(s), ${r.campaignsUpserted} campanhas sincronizadas`),
      )
      .catch((e) => console.error('[cost-sync] erro:', e instanceof Error ? e.message : e))
  setTimeout(run, 2 * 60 * 1000)
  costSyncTimer = setInterval(run, intervalMs)
  console.log(`[cost-sync] scheduler interno ativo (intervalo ${Math.round(intervalMs / 3600000)}h)`)
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
