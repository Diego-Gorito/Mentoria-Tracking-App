// DashboardKpis — 6 KPI cards com dados reais do Worker /api/analytics/summary
// Skeleton loading + empty state quando sem dados + error state com retry.

import { useMemo, useCallback, useEffect } from 'react'
import {
  Users,
  Target,
  CurrencyDollar,
  TrendUp,
  Receipt,
  Pulse,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useAnalyticsSummary } from '@/hooks/useAnalytics'
import type { SummaryResponse } from '@/hooks/useAnalytics'
import { ErrorState } from '@/components/ui/ErrorState'
import type { DashboardRange } from '@/lib/dashboardRange'

type Tone = 'neutral' | 'success' | 'warning' | 'danger'

type KpiSpec = {
  label: string
  value: string
  hint?: string
  icon: Icon
  tone?: Tone
  delta?: { value: string; positive: boolean }
}

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'text-fg-on-dark',
  success: 'text-brand-green',
  warning: 'text-amber-400',
  danger: 'text-red-400',
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDelta(pct: number): { value: string; positive: boolean } | undefined {
  if (pct === 0) return undefined
  return {
    value: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
    positive: pct > 0,
  }
}

// Skeleton individual
function KpiSkeleton() {
  return (
    <div
      className="rounded-xl border p-6 flex flex-col gap-2 animate-pulse"
      style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
    >
      <div className="flex items-start justify-between">
        <div className="h-4 w-24 rounded bg-white/[0.06]" />
        <div className="h-8 w-8 rounded-lg bg-white/[0.04]" />
      </div>
      <div className="h-7 w-20 rounded bg-white/[0.08]" />
      <div className="h-3 w-32 rounded bg-white/[0.04]" />
    </div>
  )
}

type KpiProps = {
  range: DashboardRange
  refreshKey: number
  /** Reporta o summary pro Dashboard (decide empty-state global). Sem double-fetch. */
  onData?: (data: SummaryResponse | null) => void
}

export function DashboardKpis({ range, refreshKey, onData }: KpiProps) {
  const windowDays = range.days
  const { data, loading, error } = useAnalyticsSummary(range.apiPeriod, refreshKey)

  // Reporta o summary pra cima sempre que mudar (empty-state global no Dashboard).
  useEffect(() => {
    onData?.(data)
  }, [data, onData])

  // refetch: recriar o hook triggering via key seria ideal, mas aqui usamos um
  // workaround simples — recarregar a página é aceitável em erro de rede.
  const handleRetry = useCallback(() => { window.location.reload() }, [])

  const kpis = useMemo<KpiSpec[]>(() => {
    if (!data) return []

    const { leads_total, leads_delta_pct, conversions_total, conversions_value_brl,
            spend_brl, roas, cpl_brl, dispatch_health_pct } = data

    // Os KPIs são agregados (não série diária), então refletem o bucket de API
    // (period_days do backend), não o range custom exato. Usar period_days no
    // hint mantém o número honesto com o dado mostrado.
    const windowLabel = data.period_days || windowDays

    return [
      {
        label: 'Leads totais',
        value: leads_total.toLocaleString('pt-BR'),
        hint: `Últimos ${windowLabel} dias`,
        icon: Users,
        delta: formatDelta(leads_delta_pct),
      },
      {
        label: 'Conversões',
        value: conversions_total.toLocaleString('pt-BR'),
        hint: formatBRL(conversions_value_brl),
        icon: Target,
      },
      {
        label: 'Investimento total',
        value: formatBRL(spend_brl),
        hint: 'Spend campanhas',
        icon: CurrencyDollar,
      },
      {
        label: 'ROAS blended',
        value: `${roas.toFixed(2)}x`,
        hint: roas >= 1 ? 'Lucrativo' : 'No prejuízo',
        icon: TrendUp,
        tone: roas >= 1 ? 'success' : 'danger',
      },
      {
        label: 'CPL blended',
        value: formatBRL(cpl_brl),
        hint: 'Custo por lead',
        icon: Receipt,
      },
      {
        label: 'Dispatch health',
        value: `${dispatch_health_pct.toFixed(1)}%`,
        hint: 'sent / total (24h)',
        icon: Pulse,
        tone: dispatch_health_pct >= 95 ? 'success' : dispatch_health_pct >= 90 ? 'warning' : 'danger',
      },
    ]
  }, [data, windowDays])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)}
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="rounded-xl border mb-8"
        style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
      >
        <ErrorState
          message={`Falha ao carregar KPIs: ${error}`}
          onRetry={handleRetry}
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {kpis.map((k) => {
        const KpiIcon = k.icon
        return (
          <div
            key={k.label}
            className="rounded-xl border p-6 flex flex-col gap-2 animate-fade-up"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <div className="flex items-start justify-between">
              <span className="text-body-sm text-fg-on-dark-muted">{k.label}</span>
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--app-pill-bg)', border: '1px solid var(--app-pill-border)' }}
              >
                <KpiIcon size={16} weight="duotone" className="text-fg-on-dark-muted" />
              </div>
            </div>
            <div
              className={`font-mono font-semibold text-mono-lg tabular-nums tracking-tight ${TONE_COLOR[k.tone ?? 'neutral']}`}
            >
              {k.value}
            </div>
            <div className="flex items-center justify-between text-caption text-fg-on-dark-subtle">
              <span>{k.hint}</span>
              {k.delta && (
                <span
                  className={`font-mono tabular-nums ${
                    k.delta.positive ? 'text-brand-green' : 'text-red-400'
                  }`}
                >
                  {k.delta.value}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
