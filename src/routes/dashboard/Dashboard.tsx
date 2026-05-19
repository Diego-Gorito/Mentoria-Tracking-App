// Dashboard — Mentoria Tracking App
// Orchestrator: AppShell + filtros + 3 sub-components (Kpis, Charts, Tables)
// Mock data Era 1; substituir por queryApi.run Era 1 sprint 3.

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useTenant } from '@/hooks/useTenant'
import { DashboardKpis } from './DashboardKpis'
import { DashboardCharts } from './DashboardCharts'
import { DashboardTables } from './DashboardTables'
import { Calendar } from '@phosphor-icons/react'

type Props = {
  onNavigate?: (href: string) => void
}

type WindowDays = 7 | 30 | 90

const WINDOW_OPTIONS: { value: WindowDays; label: string }[] = [
  { value: 7,  label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
]

export function Dashboard({ onNavigate }: Props) {
  const { tenant } = useTenant()
  const [windowDays, setWindowDays] = useState<WindowDays>(30)

  return (
    <AppShell activePath="/dashboard" onNavigate={onNavigate}>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-h2 font-semibold text-fg-on-dark">Dashboard</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
            {tenant?.name ?? 'Visao geral do tracking'}
          </p>
        </div>

        {/* Period selector — tabs */}
        <div
          className="inline-flex p-1 rounded-lg border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          role="tablist"
          aria-label="Periodo de analise"
        >
          {WINDOW_OPTIONS.map((opt) => {
            const active = opt.value === windowDays
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setWindowDays(opt.value)}
                className={`h-8 px-3 rounded-md text-body-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                  active
                    ? 'bg-brand-green/15 text-brand-green'
                    : 'text-fg-on-dark-muted hover:text-fg-on-dark'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Range customizado disponivel na Era 2"
            className="h-8 px-3 rounded-md text-body-sm text-fg-on-dark-subtle inline-flex items-center gap-1.5 opacity-60 cursor-not-allowed"
          >
            <Calendar size={14} weight="duotone" />
            Custom
          </button>
        </div>
      </div>

      {/* Sections */}
      <DashboardKpis windowDays={windowDays} />
      <DashboardCharts period={windowDays === 7 ? '7d' : windowDays === 90 ? '90d' : '30d'} />
      <DashboardTables />
    </AppShell>
  )
}
