// Smoke local do cost-sync: puxa custo REAL do Meta (read-only) via o provider e imprime.
// Não escreve no banco — só valida o fetch contra a Graph API.
// Uso: META_SYSTEM_USER_TOKEN=... npx tsx scripts/smoke-costsync.ts [ad_account_id] [date_preset]
import { MetaCostProvider } from '../workers/lib/costsync/providers/MetaCostProvider'

const token = process.env.META_SYSTEM_USER_TOKEN
if (!token) {
  console.error('Falta META_SYSTEM_USER_TOKEN no env')
  process.exit(1)
}
const account = process.argv[2] ?? '567799847276186'
const datePreset = process.argv[3] ?? 'last_90d'

const provider = new MetaCostProvider()
const rows = await provider.fetchCampaignCosts(
  { tenantId: 'smoke', brandSlug: 'mentoria', platform: 'meta', externalAccountId: account, credential: token },
  { datePreset },
)
const total = rows.reduce((s, r) => s + r.costCents, 0)
console.log(`\nconta ${account} · ${datePreset} · ${rows.length} campanhas com custo · total R$ ${(total / 100).toFixed(2)}\n`)
for (const r of rows.slice(0, 12)) {
  console.log(`  R$ ${(r.costCents / 100).toFixed(2).padStart(9)}  ${r.campaignName.slice(0, 48)}`)
}
