// workers/lib/costsync/providers/MetaCostProvider.ts
// Provider de custo do Meta Ads. READ-ONLY — só lê insights de spend via Graph API.
// @see docs/adr-0011 §5b

import { getMetaClient, MetaClient } from '../../meta/client'
import type { AdAccountConn, CampaignCostRow, ICostProvider } from '../types'

export class MetaCostProvider implements ICostProvider {
  readonly platform = 'meta'

  constructor(private readonly client: MetaClient = getMetaClient()) {}

  async fetchCampaignCosts(
    acct: AdAccountConn,
    opts: { datePreset: string },
  ): Promise<CampaignCostRow[]> {
    const insights = await this.client.listCampaignInsights(
      acct.credential,
      acct.externalAccountId,
      opts.datePreset,
    )

    const rows: CampaignCostRow[] = []
    for (const i of insights) {
      // spend vem como string decimal na moeda da conta (ex "835.89"); → cents.
      const cents = Math.round(parseFloat(i.spend) * 100)
      if (!Number.isFinite(cents) || cents <= 0) continue
      rows.push({
        externalCampaignId: i.campaign_id,
        campaignName: i.campaign_name,
        accountId: acct.externalAccountId,
        costCents: cents,
        currency: i.account_currency || 'BRL',
      })
    }
    return rows
  }
}
