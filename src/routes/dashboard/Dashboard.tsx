// Dashboard — Mentoria Tracking App
// Orchestrator: AppShell + filtros + 3 sub-components (Kpis, Charts, Tables)
// Mock data Era 1; substituir por queryApi.run Era 1 sprint 3.

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useTenant } from '@/hooks/useTenant'
import { useSites } from '@/hooks/useSites'
import { DashboardKpis } from './DashboardKpis'
import { DashboardCharts } from './DashboardCharts'
import { DashboardTables } from './DashboardTables'
import { Calendar, Plus, GlobeHemisphereWest } from '@phosphor-icons/react'

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
  const { sites } = useSites()
  const [windowDays, setWindowDays] = useState<WindowDays>(30)

  // Refactor onboarding-v2 (2026-05-29): banner discreto "adicionar mais sites"
  // aparece quando o user já tem pelo menos 1 site instalado. Pula o wizard de
  // novo — multi-site reusa o mesmo flow /sites/connect.
  const installedCount = sites.filter(
    (s) => s.status === 'installed' || s.status === 'uploaded_pending_activation',
  ).length

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

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-h2 font-semibold text-fg-on-dark">Dashboard</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
            {tenant?.name ?? 'Visão geral do tracking'}
          </p>
        </div>

        {/* Period selector — tabs */}
        <div
          className="inline-flex p-1 rounded-lg border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          role="tablist"
          aria-label="Período de análise"
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
            title="Range customizado disponível na Era 2"
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
