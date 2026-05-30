// Dashboard — Mentoria Tracking App
// Orchestrator: AppShell + filtros globais + widgets.
//
// Estado global do dashboard mora aqui e desce via props (árvore rasa, sem
// Context — over-engineering pra 6 filhos):
//   • range          → DashboardRange (7/30/90d ou customizado), todos respeitam
//   • refreshKey      → bump dispara refetch em TODOS os widgets (auto + manual)
//   • autoRefresh     → liga/desliga o polling de 60s
//   • lastRefreshedAt → epoch do último refresh (alimenta "atualizado há Xs")
//
// Layout (desktop → mobile):
//   header (título + DashboardFilters)
//   [empty-state global, se tenant sem nenhum evento]
//   KPIs (3 col → 1)
//   EventsTimeseriesChart full-width + PipelineStatusCard
//   Charts (3 col → 1)
//   Tables (2 col → 1)

import { useCallback, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useTenant } from '@/hooks/useTenant'
import { useSites } from '@/hooks/useSites'
import { useInterval } from '@/hooks/useInterval'
import { DashboardKpis } from './DashboardKpis'
import { DashboardCharts } from './DashboardCharts'
import { DashboardTables } from './DashboardTables'
import { DashboardFilters } from './DashboardFilters'
import { EventsTimeseriesChart } from './EventsTimeseriesChart'
import { PipelineStatusCard } from './PipelineStatusCard'
import { Plus, GlobeHemisphereWest, RocketLaunch } from '@phosphor-icons/react'
import { DEFAULT_RANGE, type DashboardRange } from '@/lib/dashboardRange'
import type { SummaryResponse } from '@/hooks/useAnalytics'

type Props = {
  onNavigate?: (href: string) => void
}

// Intervalo do auto-refresh. 60s conforme spec.
const AUTO_REFRESH_MS = 60_000

export function Dashboard({ onNavigate }: Props) {
  const { tenant } = useTenant()
  const { sites } = useSites()

  // --- Estado global do dashboard ---
  const [range, setRange] = useState<DashboardRange>(DEFAULT_RANGE)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => Date.now())
  const [summary, setSummary] = useState<SummaryResponse | null>(null)

  // Refetch de todos os widgets: bump na key + marca timestamp.
  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
    setLastRefreshedAt(Date.now())
  }, [])

  // Auto-refresh: tick a cada 60s só quando ligado (delay=null pausa).
  useInterval(triggerRefresh, autoRefresh ? AUTO_REFRESH_MS : null)

  // Trocar de período já refaz o fetch (deps do hook mudam) — mas atualiza o
  // "atualizado há" pra não ficar mentindo um tempo velho.
  const handleRangeChange = useCallback((next: DashboardRange) => {
    setRange(next)
    setLastRefreshedAt(Date.now())
  }, [])

  // Refactor onboarding-v2 (2026-05-29): banner discreto "adicionar mais sites"
  // aparece quando o user já tem pelo menos 1 site instalado. Pula o wizard de
  // novo — multi-site reusa o mesmo flow /sites/connect.
  const installedCount = sites.filter(
    (s) => s.status === 'installed' || s.status === 'uploaded_pending_activation',
  ).length

  // Empty-state global: tenant tem site(s) mas NENHUM evento/lead/conversão.
  // (summary chega via callback do DashboardKpis — sem fetch duplicado.)
  // Só mostra depois que o summary carregou (summary != null) pra não piscar.
  const hasAnyActivity =
    !summary || summary.leads_total > 0 || summary.conversions_total > 0
  const showGlobalEmpty = installedCount > 0 && summary !== null && !hasAnyActivity

  return (
    <AppShell activePath="/dashboard" onNavigate={onNavigate}>
      {/* Onboarding v2 banner — "Adicionar mais sites".
          Só renderiza quando o user já passou pelo wizard com sucesso (tem
          pelo menos 1 site). Discreto, pequeno, dismissable na próxima
          iteração (Era 1.5). */}
      {installedCount > 0 && (
        <div
          className="mb-4 rounded-lg border border-brand-green/20 bg-brand-green/[0.04] px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
          role="region"
          aria-label="Adicionar mais sites"
        >
          <div className="flex items-center gap-2 text-body-sm text-fg-on-dark">
            <GlobeHemisphereWest
              size={16}
              weight="duotone"
              className="text-brand-green shrink-0"
              aria-hidden="true"
            />
            <span>
              {installedCount} site{installedCount !== 1 ? 's' : ''} com tracking.
              Quer instalar em mais?
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('sites/connect')}
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-green hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
          >
            <Plus size={12} weight="bold" aria-hidden="true" />
            Adicionar mais sites →
          </button>
        </div>
      )}

      {/* Page header — título + filtros globais (período, auto-refresh, refresh) */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <h1 className="text-h2 font-semibold text-fg-on-dark">Dashboard</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
            {tenant?.name ?? 'Visão geral do tracking'}
          </p>
        </div>

        <DashboardFilters
          range={range}
          onRangeChange={handleRangeChange}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          lastRefreshedAt={lastRefreshedAt}
          onManualRefresh={triggerRefresh}
        />
      </div>

      {/* Empty-state global — tenant instalado mas ainda sem nenhum evento.
          Aparece UMA vez no topo; os widgets abaixo mantêm seus empty-states
          granulares ("Aguardando dados") pra cada gráfico/tabela. */}
      {showGlobalEmpty && (
        <div
          className="mb-8 rounded-xl border border-dashed flex flex-col sm:flex-row sm:items-center gap-4 p-6"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          role="status"
        >
          <div
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-green/10 border border-brand-green/20"
            aria-hidden="true"
          >
            <RocketLaunch size={26} weight="duotone" className="text-brand-green" />
          </div>
          <div className="flex-1">
            <h2 className="text-heading-sm font-semibold text-fg-on-dark">
              Aguardando os primeiros eventos do seu site
            </h2>
            <p className="text-body-sm text-fg-on-dark-muted mt-0.5 max-w-2xl">
              O tracking já está instalado. Assim que alguém visitar o site ou virar
              lead, os números aparecem aqui — costuma levar alguns minutos pro
              primeiro evento e até 24h pra série completa do funil.
            </p>
          </div>
        </div>
      )}

      {/* KPIs — reporta summary pro empty-state global via onData */}
      <DashboardKpis range={range} refreshKey={refreshKey} onData={setSummary} />

      {/* Eventos por dia (full-width) + status do pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2">
          <EventsTimeseriesChart range={range} refreshKey={refreshKey} />
        </div>
        <PipelineStatusCard range={range} refreshKey={refreshKey} />
      </div>

      {/* Charts existentes + tabelas */}
      <DashboardCharts range={range} refreshKey={refreshKey} />
      <DashboardTables refreshKey={refreshKey} />
    </AppShell>
  )
}
