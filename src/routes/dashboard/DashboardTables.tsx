// DashboardTables — 2 tabelas mock (leads recentes + dispatches em falha)
// PII mascarada nos emails (j***@gmail.com); a11y: <table> semantico, scope="col"

import { StatusBadge } from '@/components/ui/StatusBadge'

type LeadRow = {
  id: string
  nome: string
  emailMasked: string
  score: number
  ultimoEvento: string // ISO ou relativo
  source: 'meta' | 'hotmart' | 'organic' | 'direct' | 'chatwoot'
}

type DispatchRow = {
  id: string
  provider: 'meta_capi' | 'pinterest_capi' | 'google_ads'
  conversionId: string
  retries: number
  lastError: string
  nextRetry: string
}

const LEADS_MOCK: LeadRow[] = [
  { id: '1', nome: 'Maria Silva',  emailMasked: 'm***@gmail.com',   score: 92, ultimoEvento: 'ha 4min',   source: 'hotmart' },
  { id: '2', nome: 'Joao Pedro',   emailMasked: 'j***@outlook.com', score: 87, ultimoEvento: 'ha 12min',  source: 'meta' },
  { id: '3', nome: 'Ana Costa',    emailMasked: 'a***@gmail.com',   score: 78, ultimoEvento: 'ha 38min',  source: 'organic' },
  { id: '4', nome: 'Carlos Lima',  emailMasked: 'c***@yahoo.com',   score: 71, ultimoEvento: 'ha 1h',     source: 'chatwoot' },
  { id: '5', nome: 'Beatriz Sa',   emailMasked: 'b***@gmail.com',   score: 65, ultimoEvento: 'ha 2h',     source: 'direct' },
]

const DISPATCHES_MOCK: DispatchRow[] = [
  {
    id: 'd1',
    provider: 'meta_capi',
    conversionId: 'conv_8a3f...',
    retries: 4,
    lastError: 'OAUTH_TOKEN_EXPIRED',
    nextRetry: 'ha 3min',
  },
  {
    id: 'd2',
    provider: 'pinterest_capi',
    conversionId: 'conv_b22e...',
    retries: 3,
    lastError: 'INVALID_AD_ACCOUNT_ID',
    nextRetry: 'em 8min',
  },
]

const SOURCE_LABEL: Record<LeadRow['source'], string> = {
  meta: 'Meta Ads',
  hotmart: 'Hotmart',
  organic: 'Organico',
  direct: 'Direto',
  chatwoot: 'Chatwoot',
}

const PROVIDER_LABEL: Record<DispatchRow['provider'], string> = {
  meta_capi: 'Meta CAPI',
  pinterest_capi: 'Pinterest CAPI',
  google_ads: 'Google Ads',
}

function scoreTone(score: number): 'success' | 'info' | 'warning' | 'neutral' {
  if (score >= 85) return 'success'
  if (score >= 70) return 'info'
  if (score >= 50) return 'warning'
  return 'neutral'
}

function TableCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
    >
      <div className="p-6 pb-4">
        <h3 className="text-heading-sm font-semibold text-fg-on-dark">{title}</h3>
        <p className="text-body-sm text-fg-on-dark-muted">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

const TH_CLS = 'text-left text-caption font-medium uppercase tracking-wider text-fg-on-dark-subtle px-6 py-2'
const TD_CLS = 'px-6 py-3 text-body-sm text-fg-on-dark border-t border-white/[0.04]'

export function DashboardTables() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <TableCard
        title="Leads recentes"
        subtitle="Top 20 mais quentes (PII mascarada)"
      >
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.02]">
              <th scope="col" className={TH_CLS}>Lead</th>
              <th scope="col" className={TH_CLS}>Score</th>
              <th scope="col" className={TH_CLS}>Ultimo evento</th>
              <th scope="col" className={TH_CLS}>Origem</th>
            </tr>
          </thead>
          <tbody>
            {LEADS_MOCK.map((l) => (
              <tr key={l.id} className="hover:bg-white/[0.03] transition-colors">
                <td className={TD_CLS}>
                  <div className="flex flex-col">
                    <span className="font-medium">{l.nome}</span>
                    <span className="text-fg-on-dark-subtle text-caption font-mono">{l.emailMasked}</span>
                  </div>
                </td>
                <td className={TD_CLS}>
                  <StatusBadge status={scoreTone(l.score)}>{l.score}</StatusBadge>
                </td>
                <td className={`${TD_CLS} text-fg-on-dark-muted`}>{l.ultimoEvento}</td>
                <td className={`${TD_CLS} text-fg-on-dark-muted`}>{SOURCE_LABEL[l.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard
        title="Dispatches em falha"
        subtitle="retry_count >= 3"
      >
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.02]">
              <th scope="col" className={TH_CLS}>Provider</th>
              <th scope="col" className={TH_CLS}>Conversion</th>
              <th scope="col" className={TH_CLS}>Tentativas</th>
              <th scope="col" className={TH_CLS}>Ultimo erro</th>
              <th scope="col" className={TH_CLS}>Retry</th>
            </tr>
          </thead>
          <tbody>
            {DISPATCHES_MOCK.map((d) => (
              <tr key={d.id} className="hover:bg-white/[0.03] transition-colors">
                <td className={TD_CLS}>{PROVIDER_LABEL[d.provider]}</td>
                <td className={`${TD_CLS} font-mono text-caption text-fg-on-dark-muted`}>{d.conversionId}</td>
                <td className={TD_CLS}>
                  <StatusBadge status="danger">{d.retries}x</StatusBadge>
                </td>
                <td className={`${TD_CLS} font-mono text-caption text-red-400`}>{d.lastError}</td>
                <td className={`${TD_CLS} text-fg-on-dark-muted`}>{d.nextRetry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  )
}
