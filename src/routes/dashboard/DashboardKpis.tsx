// DashboardKpis — 6 KPI cards do Dashboard
// Mock data conforme spec; cores condicionais (verde/amber/vermelho) por threshold.
// Card local — NAO usa KpiCard.tsx (que assume bg-white, este precisa dark theme).

import { useMemo } from 'react'
import {
  Users,
  Target,
  CurrencyDollar,
  TrendUp,
  Receipt,
  Pulse,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

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

export function DashboardKpis({ windowDays }: { windowDays: number }) {
  // Mock data — Era 1 sprint 3 substitui por useKpis(windowDays)
  const kpis = useMemo<KpiSpec[]>(() => {
    const roas = 1.51
    const dispatchPct = 97.3
    const conversions = 83
    const revenue = 12450
    const spend = 8230
    const leads = 1247
    const cpl = spend / leads

    return [
      {
        label: 'Leads totais',
        value: leads.toLocaleString('pt-BR'),
        hint: `Ultimos ${windowDays} dias`,
        icon: Users,
        delta: { value: '+12,4%', positive: true },
      },
      {
        label: 'Conversoes',
        value: conversions.toLocaleString('pt-BR'),
        hint: formatBRL(revenue),
        icon: Target,
        delta: { value: '+8,1%', positive: true },
      },
      {
        label: 'Investimento total',
        value: formatBRL(spend),
        hint: 'Spend Meta + Google',
        icon: CurrencyDollar,
      },
      {
        label: 'ROAS blended',
        value: `${roas.toFixed(2)}x`,
        hint: roas > 1 ? 'Lucrativo' : 'No prejuizo',
        icon: TrendUp,
        tone: roas > 1 ? 'success' : 'danger',
        delta: { value: '+0,12x', positive: true },
      },
      {
        label: 'CPL blended',
        value: formatBRL(cpl),
        hint: 'Custo por lead',
        icon: Receipt,
        delta: { value: '-R$ 0,40', positive: true },
      },
      {
        label: 'Dispatch health',
        value: `${dispatchPct.toFixed(1)}%`,
        hint: 'sent / total (24h)',
        icon: Pulse,
        tone: dispatchPct >= 95 ? 'success' : dispatchPct >= 90 ? 'warning' : 'danger',
      },
    ]
  }, [windowDays])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {kpis.map((k) => {
        const Icon = k.icon
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
                <Icon size={16} weight="duotone" className="text-fg-on-dark-muted" />
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
