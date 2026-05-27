// LeadsList — lista paginada de leads com filtros básicos.
// Consume analyticsApi.leadsRecent (limite 50).
// A11y: <table> semântico, scope="col", skeleton, error state, empty state.

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Users } from '@phosphor-icons/react'
import { useAnalyticsLeadsRecent } from '@/hooks/useAnalytics'
import type { LeadRecent } from '@/hooks/useAnalytics'

// Formata data relativa
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

function scoreTone(score: number): 'success' | 'info' | 'warning' | 'neutral' {
  if (score >= 85) return 'success'
  if (score >= 70) return 'info'
  if (score >= 50) return 'warning'
  return 'neutral'
}

// Skeleton de linha
function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-6 py-3 border-t border-white/[0.04]">
          <div className="h-4 w-full max-w-[120px] rounded bg-white/[0.05] animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

const TH = 'text-left text-caption font-medium uppercase tracking-wider text-fg-on-dark-subtle px-6 py-2'
const TD = 'px-6 py-3 text-body-sm text-fg-on-dark border-t border-white/[0.04]'

type Props = {
  onNavigate?: (href: string) => void
  onSelectLead?: (leadId: string) => void
}

export function LeadsList({ onNavigate, onSelectLead }: Props) {
  const { data, loading, error } = useAnalyticsLeadsRecent(50)
  const [filter, setFilter] = useState('')

  const allLeads: LeadRecent[] = data?.data ?? []
  const leads = filter.trim()
    ? allLeads.filter((l) =>
        l.email_mask.toLowerCase().includes(filter.toLowerCase()) ||
        l.name_mask.toLowerCase().includes(filter.toLowerCase()) ||
        sourceLabelPt(l.source).toLowerCase().includes(filter.toLowerCase())
      )
    : allLeads

  return (
    <AppShell activePath="/leads" onNavigate={onNavigate}>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-h2 font-semibold text-fg-on-dark">Leads</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
            Todos os leads capturados com score e canal de origem.
          </p>
        </div>

        {/* Filtro rápido */}
        <div className="flex items-center gap-2">
          <label htmlFor="leads-filter" className="sr-only">
            Filtrar leads
          </label>
          <input
            id="leads-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por nome, e-mail ou origem…"
            className="h-9 px-3 rounded-md text-body-sm bg-white/[0.04] border border-white/10 text-fg-on-dark placeholder:text-fg-on-dark-subtle focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green w-64"
          />
        </div>
      </div>

      {/* Tabela */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Lista de leads capturados</caption>
            <thead>
              <tr className="bg-white/[0.02]">
                <th scope="col" className={TH}>Lead</th>
                <th scope="col" className={TH}>Score</th>
                <th scope="col" className={TH}>Tier</th>
                <th scope="col" className={TH}>Último evento</th>
                <th scope="col" className={TH}>Origem</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

              {!loading && error && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 border-t border-white/[0.04]">
                    <ErrorState
                      message={`Falha ao carregar leads: ${error}`}
                      onRetry={() => window.location.reload()}
                    />
                  </td>
                </tr>
              )}

              {!loading && !error && leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 border-t border-white/[0.04]">
                    <EmptyState
                      icon={Users}
                      title="Nenhum lead capturado ainda"
                      description={
                        filter
                          ? 'Nenhum resultado para o filtro informado. Tente outro termo.'
                          : 'Verifique webhooks ativos em /settings/integrations.'
                      }
                      action={
                        !filter && onNavigate
                          ? {
                              label: 'Configurar integrações',
                              onClick: () => onNavigate('integracoes'),
                            }
                          : undefined
                      }
                      className="py-8"
                    />
                  </td>
                </tr>
              )}

              {!loading && !error && leads.map((l) => (
                <tr
                  key={l.lead_id}
                  className={`transition-colors ${
                    onSelectLead
                      ? 'hover:bg-white/[0.04] cursor-pointer focus-within:bg-white/[0.04]'
                      : 'hover:bg-white/[0.03]'
                  }`}
                  onClick={() => onSelectLead?.(l.lead_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectLead?.(l.lead_id)
                    }
                  }}
                  tabIndex={onSelectLead ? 0 : undefined}
                  role={onSelectLead ? 'button' : undefined}
                  aria-label={
                    onSelectLead ? `Ver detalhes de ${l.name_mask || l.email_mask}` : undefined
                  }
                >
                  <td className={TD}>
                    <div className="flex flex-col">
                      <span className="font-medium">{l.name_mask}</span>
                      <span className="text-fg-on-dark-subtle text-caption font-mono">
                        {l.email_mask}
                      </span>
                    </div>
                  </td>
                  <td className={TD}>
                    <StatusBadge status={scoreTone(l.score)}>{l.score}</StatusBadge>
                  </td>
                  <td className={`${TD} text-fg-on-dark-muted`}>{l.score_tier || '—'}</td>
                  <td className={`${TD} text-fg-on-dark-muted`}>{relativeTime(l.last_event_at)}</td>
                  <td className={`${TD} text-fg-on-dark-muted`}>{sourceLabelPt(l.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Rodapé: contagem */}
        {!loading && !error && leads.length > 0 && (
          <div
            className="px-6 py-3 border-t text-caption text-fg-on-dark-subtle"
            style={{ borderColor: 'var(--app-card-border)' }}
          >
            {leads.length} leads
            {filter && allLeads.length !== leads.length && ` de ${allLeads.length} total`}
          </div>
        )}
      </div>
    </AppShell>
  )
}
