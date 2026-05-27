// DashboardTables — Leads recentes + Dispatches em falha (dados reais).
// PII mascarada pelo Worker (analytics.leads_quentes_safe_mv).
// A11y: <table> semantico, scope="col".

import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Users, Pulse } from '@phosphor-icons/react'
import { useAnalyticsLeadsRecent, useAnalyticsDispatchesFailed } from '@/hooks/useAnalytics'
import type { LeadRecent, DispatchFailed } from '@/hooks/useAnalytics'

// Utilitários
function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `ha ${mins}min`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `ha ${hrs}h`
    return `ha ${Math.floor(hrs / 24)}d`
  } catch {
    return '—'
  }
}

function sourceLabelPt(source: string): string {
  const map: Record<string, string> = {
    meta: 'Meta Ads',
    facebook: 'Meta Ads',
    instagram: 'Meta Ads',
    google: 'Google',
    hotmart: 'Hotmart',
    organic: 'Orgânico',
    direto: 'Direto',
    direct: 'Direto',
    chatwoot: 'Chatwoot',
    '(direct)': 'Direto',
  }
  return map[source.toLowerCase()] ?? source
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = {
    meta_capi: 'Meta CAPI',
    google_ads: 'Google Ads',
    pinterest: 'Pinterest',
    taboola: 'Taboola',
    tiktok: 'TikTok',
    kwai: 'Kwai',
    x_ads: 'X Ads',
    reddit_ads: 'Reddit Ads',
    microsoft_ads: 'Microsoft Ads',
    outbrain: 'Outbrain',
    criteo: 'Criteo',
    spotify: 'Spotify',
    amazon_ads: 'Amazon Ads',
  }
  return map[platform] ?? platform
}

function scoreTone(score: number): 'success' | 'info' | 'warning' | 'neutral' {
  if (score >= 85) return 'success'
  if (score >= 70) return 'info'
  if (score >= 50) return 'warning'
  return 'neutral'
}

// Layout
function TableCard({
  title, subtitle, children,
}: { title: string; subtitle: string; children: React.ReactNode }) {
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

// Skeleton row
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-3 border-t border-white/[0.04]">
          <div className="h-4 w-full max-w-[120px] rounded bg-white/[0.05] animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

const TH = 'text-left text-caption font-medium uppercase tracking-wider text-fg-on-dark-subtle px-6 py-2'
const TD = 'px-6 py-3 text-body-sm text-fg-on-dark border-t border-white/[0.04]'

// --- Leads recentes ---

function LeadsTable() {
  const { data, loading, error } = useAnalyticsLeadsRecent(20)
  const leads: LeadRecent[] = data?.data ?? []

  return (
    <TableCard title="Leads recentes" subtitle="Top 20 mais quentes (PII mascarada)">
      <table className="w-full">
        <thead>
          <tr className="bg-white/[0.02]">
            <th scope="col" className={TH}>Lead</th>
            <th scope="col" className={TH}>Score</th>
            <th scope="col" className={TH}>Último evento</th>
            <th scope="col" className={TH}>Origem</th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)}

          {!loading && error && (
            <tr>
              <td colSpan={4} className="px-6 py-4 border-t border-white/[0.04]">
                <ErrorState
                  message={`Falha ao carregar leads: ${error}`}
                  onRetry={() => window.location.reload()}
                />
              </td>
            </tr>
          )}

          {!loading && !error && leads.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-8 border-t border-white/[0.04]">
                <EmptyState
                  icon={Users}
                  title="Aguardando dados"
                  description="Leads aparecem aqui assim que o tracking estiver ativo."
                  className="py-4"
                />
              </td>
            </tr>
          )}

          {!loading && !error && leads.map((l) => (
            <tr key={l.lead_id} className="hover:bg-white/[0.03] transition-colors">
              <td className={TD}>
                <div className="flex flex-col">
                  <span className="font-medium">{l.name_mask}</span>
                  <span className="text-fg-on-dark-subtle text-caption font-mono">{l.email_mask}</span>
                </div>
              </td>
              <td className={TD}>
                <StatusBadge status={scoreTone(l.score)}>{l.score}</StatusBadge>
              </td>
              <td className={`${TD} text-fg-on-dark-muted`}>{relativeTime(l.last_event_at)}</td>
              <td className={`${TD} text-fg-on-dark-muted`}>{sourceLabelPt(l.source)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

// --- Dispatches em falha ---

function DispatchesTable() {
  const { data, loading, error } = useAnalyticsDispatchesFailed(20)
  const dispatches: DispatchFailed[] = data?.data ?? []

  return (
    <TableCard title="Dispatches em falha" subtitle="retry_count >= 3">
      <table className="w-full">
        <thead>
          <tr className="bg-white/[0.02]">
            <th scope="col" className={TH}>Provider</th>
            <th scope="col" className={TH}>Conversion</th>
            <th scope="col" className={TH}>Tentativas</th>
            <th scope="col" className={TH}>Último erro</th>
            <th scope="col" className={TH}>Tentativa</th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}

          {!loading && error && (
            <tr>
              <td colSpan={5} className="px-6 py-4 border-t border-white/[0.04]">
                <ErrorState
                  message={`Falha ao carregar dispatches: ${error}`}
                  onRetry={() => window.location.reload()}
                />
              </td>
            </tr>
          )}

          {!loading && !error && dispatches.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-8 border-t border-white/[0.04]">
                <EmptyState
                  icon={Pulse}
                  title="Sem falhas — ótimo!"
                  description="Nenhum dispatch com 3+ retries nas últimas 24h."
                  className="py-4"
                />
              </td>
            </tr>
          )}

          {!loading && !error && dispatches.map((d) => (
            <tr key={d.dispatch_id} className="hover:bg-white/[0.03] transition-colors">
              <td className={TD}>{platformLabel(d.platform)}</td>
              <td className={`${TD} font-mono text-caption text-fg-on-dark-muted`}>
                {d.conversion_id.slice(0, 8)}...
              </td>
              <td className={TD}>
                <StatusBadge status="danger">{d.retry_count}x</StatusBadge>
              </td>
              <td className={`${TD} font-mono text-caption text-red-400 max-w-[160px] truncate`}>
                {d.last_error || '—'}
              </td>
              <td className={`${TD} text-fg-on-dark-muted`}>{relativeTime(d.last_attempt_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  )
}

// --- Export principal ---

export function DashboardTables() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <LeadsTable />
      <DispatchesTable />
    </div>
  )
}
