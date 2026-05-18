// DashboardCharts — 3 placeholders (Era 2: implementar com recharts ou similar)
// Manter como wrapper agora pra evitar +50KB bundle sem data shape definido.

import { EmptyState } from '@/components/ui/EmptyState'
import {
  ChartLineDown,
  ChartBar,
  ChartPieSlice,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

type ChartSpec = {
  title: string
  subtitle: string
  emptyTitle: string
  emptyDesc: string
  icon: Icon
}

const CHARTS: ChartSpec[] = [
  {
    title: 'Funil diario',
    subtitle: 'Leads -> MQL -> Conversao',
    emptyTitle: 'Aguardando dados',
    emptyDesc: 'Funil disponivel apos 24h de coleta continua.',
    icon: ChartLineDown,
  },
  {
    title: 'ROAS por plataforma',
    subtitle: 'Meta, Pinterest, Google',
    emptyTitle: 'Aguardando dados',
    emptyDesc: 'Conecte pelo menos 1 plataforma de ads pra ver ROAS.',
    icon: ChartBar,
  },
  {
    title: 'Leads por canal',
    subtitle: 'Organic, Paid, Direct',
    emptyTitle: 'Aguardando dados',
    emptyDesc: 'Canais aparecem aqui assim que o tracking estiver ativo.',
    icon: ChartPieSlice,
  },
]

export function DashboardCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
      {CHARTS.map((c) => (
        <div
          key={c.title}
          className="rounded-xl border p-6"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          <h3 className="text-heading-sm font-semibold text-fg-on-dark">{c.title}</h3>
          <p className="text-body-sm text-fg-on-dark-muted mb-3">{c.subtitle}</p>
          <div className="rounded-lg border border-dashed border-white/10 min-h-[180px] flex items-center justify-center">
            <EmptyState
              icon={c.icon}
              title={c.emptyTitle}
              description={c.emptyDesc}
              className="py-6"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
