// LeadDetail — detalhe de um lead com dados disponíveis no analytics.
// Sem endpoint de detalhe individual no backend atual — exibe dados da lista
// mais um placeholder de timeline (Era 1.5: endpoint /api/analytics/lead/:id).
// A11y: seções com heading correto, role="status" no loading.

import { AppShell } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { ArrowLeft, Users } from '@phosphor-icons/react'
import { useAnalyticsLeadsRecent } from '@/hooks/useAnalytics'
import type { LeadRecent } from '@/hooks/useAnalytics'

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `há ${mins}min`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `há ${hrs}h`
    return `há ${Math.floor(hrs / 24)}d`
  } catch {
    return '—'
  }
}

function sourceLabelPt(source: string): string {
  const map: Record<string, string> = {
    meta: 'Meta Ads', facebook: 'Meta Ads', instagram: 'Meta Ads',
    google: 'Google', hotmart: 'Hotmart', organic: 'Orgânico',
    direto: 'Direto', direct: 'Direto', chatwoot: 'Chatwoot', '(direct)': 'Direto',
  }
  return map[source.toLowerCase()] ?? source
}

function scoreTone(score: number): 'success' | 'info' | 'warning' | 'neutral' {
  if (score >= 85) return 'success'
  if (score >= 70) return 'info'
  if (score >= 50) return 'warning'
  return 'neutral'
}

// Campo de detalhe simples
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-fg-on-dark-subtle uppercase tracking-wider">{label}</dt>
      <dd className="text-body-sm text-fg-on-dark">{value}</dd>
    </div>
  )
}

type Props = {
  leadId: string
  onNavigate?: (href: string) => void
  onBack?: () => void
}

export function LeadDetail({ leadId, onNavigate, onBack }: Props) {
  // Usa a lista como fonte de dados — sem endpoint de detalhe individual ainda.
  // TODO Era 1.5: adicionar GET /api/analytics/lead/:leadId no Worker.
  const { data, loading, error } = useAnalyticsLeadsRecent(50)
  const lead: LeadRecent | undefined = data?.data?.find((l) => l.lead_id === leadId)

  return (
    <AppShell activePath="/leads" onNavigate={onNavigate}>
      {/* Breadcrumb / back */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack ?? (() => onNavigate?.('leads'))}
          className="inline-flex items-center gap-1.5 text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          <ArrowLeft size={14} weight="bold" />
          Voltar para Leads
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div role="status" aria-live="polite" aria-label="Carregando detalhes do lead">
          <div className="rounded-xl border p-6 animate-pulse space-y-4"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}>
            <div className="h-6 w-48 rounded bg-white/[0.06]" />
            <div className="h-4 w-32 rounded bg-white/[0.04]" />
            <div className="grid grid-cols-2 gap-4 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-white/[0.04]" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Erro */}
      {!loading && error && (
        <div className="rounded-xl border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}>
          <ErrorState
            message={`Falha ao carregar dados do lead: ${error}`}
            onRetry={() => window.location.reload()}
          />
        </div>
      )}

      {/* Lead não encontrado na lista (ID inválido) */}
      {!loading && !error && !lead && (
        <div className="rounded-xl border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}>
          <EmptyState
            icon={Users}
            title="Lead não encontrado"
            description="O ID informado não corresponde a nenhum lead nos últimos 50 registros."
            action={onBack
              ? { label: 'Voltar para Leads', onClick: onBack }
              : undefined}
            className="py-12"
          />
        </div>
      )}

      {/* Dados do lead */}
      {!loading && !error && lead && (
        <div className="flex flex-col gap-4">
          {/* Header card */}
          <section
            aria-labelledby="lead-detail-heading"
            className="rounded-xl border p-6"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
              <div>
                <h1
                  id="lead-detail-heading"
                  className="text-h3 font-semibold text-fg-on-dark"
                >
                  {lead.name_mask || lead.email_mask}
                </h1>
                <p className="text-body-sm text-fg-on-dark-muted font-mono mt-0.5">
                  {lead.email_mask}
                </p>
              </div>
              <StatusBadge status={scoreTone(lead.score)}>
                Score {lead.score}
              </StatusBadge>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
              <DetailRow label="Tier" value={lead.score_tier || '—'} />
              <DetailRow label="Origem" value={sourceLabelPt(lead.source)} />
              <DetailRow label="Último evento" value={relativeTime(lead.last_event_at)} />
              <DetailRow label="Lead ID" value={
                <span className="font-mono text-caption text-fg-on-dark-subtle">
                  {lead.lead_id.slice(0, 8)}…
                </span>
              } />
            </dl>
          </section>

          {/* Timeline placeholder — Era 1.5 */}
          <section
            aria-labelledby="lead-timeline-heading"
            className="rounded-xl border p-6"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <h2
              id="lead-timeline-heading"
              className="text-heading-sm font-semibold text-fg-on-dark mb-4"
            >
              Timeline de eventos
            </h2>
            <div
              className="rounded-lg border border-dashed border-white/10 py-10 flex flex-col items-center gap-2 text-center"
            >
              <p className="text-body-sm text-fg-on-dark-muted">
                Histórico detalhado disponível na Era 1.5.
              </p>
              <p className="text-caption text-fg-on-dark-subtle">
                Requer endpoint <span className="font-mono">GET /api/analytics/lead/:leadId</span> no Worker.
              </p>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}
