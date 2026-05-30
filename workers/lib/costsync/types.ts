// workers/lib/costsync/types.ts
// Framework de sync de CUSTO de ad platforms → tracking.campaigns.cost_cents.
// @see docs/adr-0011 §5b — multi-plataforma, READ-ONLY (só lê spend, nunca publica).

/** Custo de uma campanha puxado de uma ad platform, já normalizado. */
export interface CampaignCostRow {
  /** ID da campanha na plataforma (Meta campaign_id, etc). */
  externalCampaignId: string
  campaignName: string
  /** ID da conta na plataforma (sem prefixo act_). */
  accountId: string
  costCents: number
  currency: string
}

/** Conta de anúncio conectada de um tenant + credencial já resolvida. */
export interface AdAccountConn {
  tenantId: string
  brandSlug: string | null
  platform: string
  externalAccountId: string
  /** Token resolvido pelo orquestrador. NUNCA logar. */
  credential: string
}

/**
 * Provider de custo por plataforma. READ-ONLY por contrato: implementações só
 * podem LER spend/insights — nunca criar/ativar/publicar campanha (isso gasta
 * dinheiro e é função do app de postagens). @see docs/adr-0011 §5b.
 */
export interface ICostProvider {
  readonly platform: string
  fetchCampaignCosts(
    acct: AdAccountConn,
    opts: { datePreset: string },
  ): Promise<CampaignCostRow[]>
}

/** Resultado agregado de um sync por tenant. */
export interface CostSyncResult {
  tenantId: string
  accountsProcessed: number
  accountsSkipped: number
  campaignsUpserted: number
  byPlatform: Record<
    string,
    { accounts: number; campaigns: number; costCents: number; error?: string }
  >
}
