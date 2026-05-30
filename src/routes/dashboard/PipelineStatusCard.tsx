// PipelineStatusCard — painel de saúde do pipeline de tracking.
//
// Junta dados de 3 fontes num card só:
//   1. Último evento recebido (timestamp + "há X min") — pega o last_event_at
//      mais recente de /api/analytics/leads-recent (é um timestamp REAL de
//      evento, granularidade ao segundo — melhor sinal disponível no client).
//   2. Eventos coletados no período recente — soma do dia mais recente da série
//      /api/analytics/funnel (granularidade diária; rotulado honestamente como
//      "hoje" quando o último bucket é a data corrente, senão "último dia").
//   3. Status do plugin por site — de useSites() (installed/pending/failed/...).
//
// Não precisou de endpoint novo: reusa funnel + leads-recent + sites.

import { useMemo } from 'react'
import {
  Pulse, CheckCircle, WarningCircle, Clock, Globe,
} from '@phosphor-icons/react'
import { useAnalyticsFunnel, useAnalyticsLeadsRecent } from '@/hooks/useAnalytics'
import { useSites } from '@/hooks/useSites'
import type { EnrichedSite, SiteStatus } from '@/types/sites'
import { type DashboardRange, toIsoDay } from '@/lib/dashboardRange'

const CARD_STYLE = {
  background: 'var(--app-card-bg)',
  borderColor: 'var(--app-card-border)',
}

// "há X" a partir de um ISO. Retorna null se inválido/ausente.
function relativeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const mins = Math.floor((Date.now() - t) / 60_000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `há ${hrs}h`
  return `há ${Math.floor(hrs / 24)}d`
}

// Sinal de saúde a partir da idade do último evento.
function freshnessTone(iso: string | null | undefined): { tone: 'ok' | 'warn' | 'stale'; dot: string } {
  if (!iso) return { tone: 'stale', dot: 'bg-zinc-500' }
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000
  if (mins <= 60) return { tone: 'ok', dot: 'bg-brand-green' }
  if (mins <= 24 * 60) return { tone: 'warn', dot: 'bg-amber-400' }
  return { tone: 'stale', dot: 'bg-red-400' }
}

// Colapsa os status granulares do backend nos 3 buckets do widget.
function bucketOf(status: SiteStatus | undefined): 'installed' | 'pending' | 'failed' {
  switch (status) {
    case 'installed':
      return 'installed'
    case 'failed':
    case 'drift_detected':
      return 'failed'
    default:
      // draft, uploaded_pending_activation, not_installed, undefined
      return 'pending'
  }
}

const SITE_BADGE: Record<'installed' | 'pending' | 'failed', { label: string; cls: string; Icon: typeof CheckCircle }> = {
  installed: { label: 'Ativo', cls: 'text-brand-green', Icon: CheckCircle },
  pending: { label: 'Pendente', cls: 'text-amber-400', Icon: Clock },
  failed: { label: 'Falhou', cls: 'text-red-400', Icon: WarningCircle },
}

function StatRow({ label, value, hint, dot }: {
  label: string
  value: string
  hint?: string
  dot?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {dot && <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} aria-hidden="true" />}
        <span className="text-body-sm text-fg-on-dark-muted truncate">{label}</span>
      </div>
      <div className="text-right shrink-0">
        <span className="text-body-sm font-medium text-fg-on-dark tabular-nums">{value}</span>
        {hint && <span className="block text-caption text-fg-on-dark-subtle">{hint}</span>}
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border p-6 animate-pulse" style={CARD_STYLE}>
      <div className="h-5 w-36 rounded bg-white/[0.06] mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-white/[0.04]" />
        ))}
      </div>
    </div>
  )
}

type Props = {
  range: DashboardRange
  refreshKey: number
}

export function PipelineStatusCard({ range, refreshKey }: Props) {
  const { data: funnelData, loading: funnelLoading } = useAnalyticsFunnel(range.apiPeriod, refreshKey)
  const { data: leadsData, loading: leadsLoading } = useAnalyticsLeadsRecent(20, refreshKey)
  const { sites, isLoading: sitesLoading } = useSites()

  // 1. Último evento — last_event_at mais recente entre os leads.
  const lastEventIso = useMemo(() => {
    const leads = leadsData?.data ?? []
    let max: string | null = null
    for (const l of leads) {
      if (l.last_event_at && (!max || l.last_event_at > max)) max = l.last_event_at
    }
    return max
  }, [leadsData])

  // 2. Eventos do dia mais recente da série (proxy de "últimas 24h").
  const recentDay = useMemo(() => {
    const rows = funnelData?.data ?? []
    if (rows.length === 0) return null
    const last = rows[rows.length - 1] // funnel vem ordenado asc por day
    const total = (last.sessions ?? 0) + (last.leads ?? 0) + (last.conversions ?? 0)
    const isToday = last.day === toIsoDay(new Date())
    return { total, isToday, day: last.day }
  }, [funnelData])

  // 3. Status dos sites agrupado.
  const siteBuckets = useMemo(() => {
    const acc = { installed: 0, pending: 0, failed: 0 }
    for (const s of sites as EnrichedSite[]) acc[bucketOf(s.status)] += 1
    return acc
  }, [sites])

  const loading = funnelLoading && leadsLoading && sitesLoading
  if (loading) return <CardSkeleton />

  const fresh = freshnessTone(lastEventIso)
  const lastEventLabel = relativeAgo(lastEventIso)
  const totalSites = siteBuckets.installed + siteBuckets.pending + siteBuckets.failed

  return (
    <div className="rounded-xl border p-6 flex flex-col" style={CARD_STYLE}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-heading-sm font-semibold text-fg-on-dark">Status do pipeline</h3>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--app-pill-bg)', border: '1px solid var(--app-pill-border)' }}
        >
          <Pulse size={16} weight="duotone" className={fresh.tone === 'ok' ? 'text-brand-green' : 'text-fg-on-dark-muted'} />
        </div>
      </div>
      <p className="text-body-sm text-fg-on-dark-muted mb-3">Saúde da coleta de eventos</p>

      <div className="divide-y divide-white/[0.05]">
        <StatRow
          label="Último evento"
          value={lastEventLabel ?? 'Nenhum ainda'}
          hint={lastEventIso ? new Date(lastEventIso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : undefined}
          dot={fresh.dot}
        />
        <StatRow
          label={recentDay?.isToday ? 'Eventos hoje' : 'Eventos (último dia)'}
          value={recentDay ? recentDay.total.toLocaleString('pt-BR') : '0'}
          hint={recentDay && !recentDay.isToday ? new Date(`${recentDay.day}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : undefined}
        />
      </div>

      {/* Status dos sites */}
      <div className="mt-3 pt-3 border-t border-white/[0.05]">
        <div className="flex items-center gap-1.5 mb-2">
          <Globe size={13} weight="duotone" className="text-fg-on-dark-subtle" aria-hidden="true" />
          <span className="text-caption uppercase tracking-wider text-fg-on-dark-subtle">
            Plugin por site ({totalSites})
          </span>
        </div>

        {totalSites === 0 ? (
          <p className="text-caption text-fg-on-dark-subtle py-1">
            Nenhum site conectado ainda.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(['installed', 'pending', 'failed'] as const).map((k) => {
              const count = siteBuckets[k]
              if (count === 0) return null
              const { label, cls, Icon } = SITE_BADGE[k]
              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-caption font-medium ${cls}`}
                  style={{ background: 'var(--app-pill-bg)', borderColor: 'var(--app-pill-border)' }}
                >
                  <Icon size={12} weight="fill" aria-hidden="true" />
                  {count} {label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
