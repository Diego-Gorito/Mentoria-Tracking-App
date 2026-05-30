// EventsTimeseriesChart — volume de eventos por dia, empilhado por tipo.
//
// Fonte de dados: reusa GET /api/analytics/funnel (já devolve agregados diários
// por escola). NÃO precisou de endpoint novo — o funil_diario já tem a série:
//   sessions  → page_view   (visitas instrumentadas)
//   leads     → generate_lead
//   conversions → purchase   (app_purchases + escola_matriculas)
//   mql       → contato qualificado (proxy do "contact"/engajamento)
//
// É um AreaChart empilhado (mesmo estilo visual do ChannelsChart). Largura full
// — ocupa a linha inteira acima dos 3 charts menores. Mobile: encolhe a altura.

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChartLine } from '@phosphor-icons/react'
import { useAnalyticsFunnel } from '@/hooks/useAnalytics'
import { type DashboardRange, clipDailyToRange } from '@/lib/dashboardRange'

// Cores alinhadas com DashboardCharts (mesma paleta dark-safe).
const SERIES = [
  { key: 'page_view', name: 'Page view', color: '#60a5fa', src: 'sessions' as const },
  { key: 'generate_lead', name: 'Gerar lead', color: '#16DF6F', src: 'leads' as const },
  { key: 'contact', name: 'Contato (MQL)', color: '#a78bfa', src: 'mql' as const },
  { key: 'purchase', name: 'Compra', color: '#f59e0b', src: 'conversions' as const },
]

const CHART_STYLE = {
  background: 'var(--app-card-bg)',
  borderColor: 'var(--app-card-border)',
}

function fmtDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border p-6 animate-pulse" style={CHART_STYLE}>
      <div className="h-5 w-40 rounded bg-white/[0.06] mb-1" />
      <div className="h-3 w-56 rounded bg-white/[0.04] mb-4" />
      <div className="h-[220px] rounded-lg bg-white/[0.03]" />
    </div>
  )
}

function DarkTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-caption shadow-lg">
      <p className="text-fg-on-dark-muted mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString('pt-BR')}
        </p>
      ))}
      <p className="text-fg-on-dark mt-1 pt-1 border-t border-white/10 font-medium">
        Total: {total.toLocaleString('pt-BR')}
      </p>
    </div>
  )
}

type Props = {
  range: DashboardRange
  refreshKey: number
}

export function EventsTimeseriesChart({ range, refreshKey }: Props) {
  const { data, loading } = useAnalyticsFunnel(range.apiPeriod, refreshKey)

  // Remapeia funil → série por tipo de evento, recortando pro range custom.
  const rows = useMemo(() => {
    const raw = data?.data ?? []
    const clipped = clipDailyToRange(raw, range)
    return clipped.map((r) => ({
      day: fmtDay(r.day),
      page_view: r.sessions ?? 0,
      generate_lead: r.leads ?? 0,
      contact: r.mql ?? 0,
      purchase: r.conversions ?? 0,
    }))
  }, [data, range])

  // Considera "vazio" se não tem linha nenhuma OU todas as séries zeradas.
  const isEmpty = rows.length === 0 || rows.every(
    (r) => r.page_view + r.generate_lead + r.contact + r.purchase === 0,
  )

  if (loading) return <ChartSkeleton />

  return (
    <div className="rounded-xl border p-6" style={CHART_STYLE}>
      <h3 className="text-heading-sm font-semibold text-fg-on-dark">Eventos por dia</h3>
      <p className="text-body-sm text-fg-on-dark-muted mb-4">
        Volume de eventos coletados, por tipo
      </p>

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-white/10 min-h-[220px] flex items-center justify-center">
          <EmptyState
            icon={ChartLine}
            title="Aguardando primeiros eventos"
            description="Assim que seu site começar a mandar eventos, o volume diário aparece aqui."
            className="py-8"
          />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`evt-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.04} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="day"
              tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }} />
            {SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="evt"
                stroke={s.color}
                strokeWidth={1.5}
                fill={`url(#evt-${s.key})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
