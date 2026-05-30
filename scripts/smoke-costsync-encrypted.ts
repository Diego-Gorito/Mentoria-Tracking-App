// Valida o round-trip B: decifra o token (sealed_box) e puxa custo via o provider —
// idêntico ao que o cost-sync faz em prod. Imprime SÓ o resultado; nunca o token/keys.
// Uso: CIPHER=... STORAGE_ENCRYPTION_PUBLIC_KEY=... STORAGE_ENCRYPTION_SECRET_KEY=... npx tsx scripts/smoke-costsync-encrypted.ts
import { sealDecrypt } from '../workers/lib/storage/crypto'
import { MetaCostProvider } from '../workers/lib/costsync/providers/MetaCostProvider'

const cipher = process.env.CIPHER
const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY
const sec = process.env.STORAGE_ENCRYPTION_SECRET_KEY
if (!cipher || !pub || !sec) {
  console.error('Falta CIPHER / STORAGE_ENCRYPTION_PUBLIC_KEY / STORAGE_ENCRYPTION_SECRET_KEY')
  process.exit(1)
}

let token: string
try {
  token = await sealDecrypt(cipher, pub, sec)
} catch (e) {
  console.error('DECRYPT FALHOU (keypair não corresponde?):', e instanceof Error ? e.message : e)
  process.exit(2)
}

const provider = new MetaCostProvider()
const rows = await provider.fetchCampaignCosts(
  { tenantId: 'smoke', brandSlug: 'mentoria', platform: 'meta', externalAccountId: '567799847276186', credential: token },
  { datePreset: 'last_90d' },
)
const total = rows.reduce((s, r) => s + r.costCents, 0)
console.log(`decrypt OK · token decifrado com sucesso · ${rows.length} campanhas · R$ ${(total / 100).toFixed(2)}`)
