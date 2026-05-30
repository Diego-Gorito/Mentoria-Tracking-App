import { describe, it, expect } from 'vitest'
import { MetaCostProvider } from '../providers/MetaCostProvider'
import type { MetaClient, MetaCampaignInsight } from '../../meta/client'
import type { AdAccountConn } from '../types'

function stubClient(insights: MetaCampaignInsight[]): MetaClient {
  return { listCampaignInsights: async () => insights } as unknown as MetaClient
}

const acct: AdAccountConn = {
  tenantId: 't1',
  brandSlug: 'mentoria',
  platform: 'meta',
  externalAccountId: '567799847276186',
  credential: 'TOKEN',
}

describe('MetaCostProvider', () => {
  it('converte spend decimal pra cents e mapeia os campos', async () => {
    const p = new MetaCostProvider(
      stubClient([{ campaign_id: '120', campaign_name: 'EFOMM', spend: '57.31', account_currency: 'BRL' }]),
    )
    const rows = await p.fetchCampaignCosts(acct, { datePreset: 'last_30d' })
    expect(rows).toEqual([
      {
        externalCampaignId: '120',
        campaignName: 'EFOMM',
        accountId: '567799847276186',
        costCents: 5731,
        currency: 'BRL',
      },
    ])
  })

  it('filtra campanhas sem gasto (spend 0, negativo ou não-numérico)', async () => {
    const p = new MetaCostProvider(
      stubClient([
        { campaign_id: '1', campaign_name: 'zero', spend: '0', account_currency: 'BRL' },
        { campaign_id: '2', campaign_name: 'nan', spend: 'Not available', account_currency: 'BRL' },
        { campaign_id: '3', campaign_name: 'ok', spend: '12.00', account_currency: 'BRL' },
      ]),
    )
    const rows = await p.fetchCampaignCosts(acct, { datePreset: 'last_30d' })
    expect(rows.map((r) => r.externalCampaignId)).toEqual(['3'])
    expect(rows[0].costCents).toBe(1200)
  })

  it('arredonda centavos corretamente', async () => {
    const p = new MetaCostProvider(
      stubClient([{ campaign_id: '1', campaign_name: 'r', spend: '835.895', account_currency: 'BRL' }]),
    )
    const rows = await p.fetchCampaignCosts(acct, { datePreset: 'last_30d' })
    expect(rows[0].costCents).toBe(83590)
  })

  it('platform é meta', () => {
    expect(new MetaCostProvider(stubClient([])).platform).toBe('meta')
  })
})
