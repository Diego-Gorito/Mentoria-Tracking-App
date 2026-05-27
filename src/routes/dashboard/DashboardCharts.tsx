// DashboardCharts — 3 charts com dados reais (recharts).
// Funil diário (LineChart) + ROAS por plataforma (BarChart) + Leads por canal (StackedAreaChart).

import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { EmptyState } from '@/components/ui/EmptyState'
import { ChartLineDown, ChartBar, ChartPieSlice } from '@phosphor-icons/react'
import { useAnalyticsFunnel, useAnalyticsRoiPlatforms, useAnalyticsChannels } from '@/hooks/useAnalytics'
import type { Period } from '@/hooks/useAnalytics'

// Design tokens — dark background safe
const COLORS = {
  leads: '#16DF6F',
  mql: '#60a5fa',
  conversions: '#f59e0b',
  meta: '#3b82f6',
  google: '#ef4444',
  organic: '#16DF6F',
  hotmart: '#a78bfa',
  direct: '#94a3b8',
  outros: '#64748b',
  grid: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.35)',
}

const CHART_STYLE = {
  background: 'var(--app-card-bg)',
  borderColor: 'var(--app-card-border)',
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border p-6 animate-pulse" style={CHART_STYLE}>
      <div className="h-5 w-32 rounded bg-white/[0.06] mb-1" />
      <div className="h-3 w-48 rounded bg-white/[0.04] mb-4" />
      <div className="h-[180px] rounded-lg bg-white/[0.03]" />
    </div>
  )
}

// Formata label do eixo X (YYYY-MM-DD → DD/MM)
function fmtDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

// Tooltip customizado pro dark theme
function DarkTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-caption shadow-lg">
      <p className="text-fg-on-dark-muted mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString('pt-BR')}
        </p>
      ))}
    </div>
  )
}

// --- Funil diário ---

function FunnelChart({ period }: { period: Period }) {
  const { data, loading } = useAnalyticsFunnel(period)
  const rows = data?.data ?? []

  if (loading) return <ChartSkeleton />

  return (
    <div className="rounded-xl border p-6" style={CHART_STYLE}>
      <h3 className="text-heading-sm font-semibold text-fg-on-dark">Funil diario</h3>
      <p className="text-body-sm text-fg-on-dark-muted mb-4">Leads › MQL › Conversao</p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 min-h-[180px] flex items-center justify-center">
          <EmptyState
            icon={ChartLineDown}
            title="Aguardando dados"
            description="Funil disponivel apos 24h de coleta continua."
            className="py-6"
          />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={rows.map((r) => ({ ...r, day: fmtDay(r.day) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis dataKey="day" tick={{ fill: COLORS.axis, fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: COLORS.axis, fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: COLORS.axis }} />
            <Line type="monotone" dataKey="leads" name="Leads" stroke={COLORS.leads} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="mql" name="MQL" stroke={COLORS.mql} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="conversions" name="Conversões" stroke={COLORS.conversions} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// --- ROAS por plataforma ---

function RoasPlatformChart({ period }: { period: Period }) {
  const { data, loading } = useAnalyticsRoiPlatforms(period)
  const rows = data?.data ?? []

  if (loading) return <ChartSkeleton />

  return (
    <div className="rounded-xl border p-6" style={CHART_STYLE}>
      <h3 className="text-heading-sm font-semibold text-fg-on-dark">ROAS por plataforma</h3>
      <p className="text-body-sm text-fg-on-dark-muted mb-4">Retorno sobre investimento</p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 min-h-[180px] flex items-center justify-center">
          <EmptyState
            icon={ChartBar}
            title="Aguardando dados"
            description="Conecte pelo menos 1 plataforma de ads pra ver ROAS."
            className="py-6"
          />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: COLORS.axis, fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="platform" tick={{ fill: COLORS.axis, fontSize: 10 }} tickLine={false} width={60} />
            <Tooltip content={<DarkTooltip />} />
            <Bar dataKey="roas" name="ROAS" fill={COLORS.leads} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// --- Leads por canal ---

function ChannelsChart({ period }: { period: Period }) {
  const { data, loading } = useAnalyticsChannels(period)
  const rows = data?.data ?? []

  if (loading) return <ChartSkeleton />

  return (
    <div className="rounded-xl border p-6" style={CHART_STYLE}>
      <h3 className="text-heading-sm font-semibold text-fg-on-dark">Leads por canal</h3>
      <p className="text-body-sm text-fg-on-dark-muted mb-4">Organic, Paid, Direct</p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 min-h-[180px] flex items-center justify-center">
          <EmptyState
            icon={ChartPieSlice}
            title="Aguardando dados"
            description="Canais aparecem aqui assim que o tracking estiver ativo."
            className="py-6"
          />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={rows.map((r) => ({ ...r, day: fmtDay(r.day) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis dataKey="day" tick={{ fill: COLORS.axis, fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: COLORS.axis, fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: COLORS.axis }} />
            <Area type="monotone" dataKey="organic"  name="Orgânico" stackId="1" stroke={COLORS.organic}  fill={COLORS.organic}  fillOpacity={0.25} />
            <Area type="monotone" dataKey="meta"     name="Meta"     stackId="1" stroke={COLORS.meta}     fill={COLORS.meta}     fillOpacity={0.25} />
            <Area type="monotone" dataKey="google"   name="Google"   stackId="1" stroke={COLORS.google}   fill={COLORS.google}   fillOpacity={0.25} />
            <Area type="monotone" dataKey="hotmart"  name="Hotmart"  stackId="1" stroke={COLORS.hotmart}  fill={COLORS.hotmart}  fillOpacity={0.25} />
            <Area type="monotone" dataKey="direct"   name="Direto"   stackId="1" stroke={COLORS.direct}   fill={COLORS.direct}   fillOpacity={0.25} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// --- Export principal ---

export function DashboardCharts({ period }: { period: Period }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
      <FunnelChart period={period} />
      <RoasPlatformChart period={period} />
      <ChannelsChart period={period} />
    </div>
  )
}
