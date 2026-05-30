// DashboardFilters — controle global do dashboard:
//   • seletor de período (7/30/90 dias + customizado com 2 inputs date)
//   • toggle de auto-refresh (default ligado, 60s)
//   • botão de refresh manual + indicador "atualizado há Xs"
//
// Tudo que renderiza dado no dashboard respeita o `range` daqui (prop-drill).
// O componente é controlado: estado mora no Dashboard.tsx, aqui só dispara
// callbacks. Mobile: vira coluna, os botões de período fazem wrap.

import { useEffect, useRef, useState } from 'react'
import { Calendar, ArrowsClockwise, Check } from '@phosphor-icons/react'
import {
  type DashboardRange,
  type DashboardPreset,
  presetRange,
  customRange,
} from '@/lib/dashboardRange'

type Props = {
  range: DashboardRange
  onRangeChange: (range: DashboardRange) => void
  autoRefresh: boolean
  onAutoRefreshChange: (on: boolean) => void
  /** epoch ms do último refresh bem-sucedido — alimenta "atualizado há Xs". */
  lastRefreshedAt: number
  /** dispara refetch manual de todos os widgets. */
  onManualRefresh: () => void
  /** true enquanto algum widget está buscando (gira o ícone). */
  refreshing?: boolean
}

const PRESET_OPTIONS: { value: Exclude<DashboardPreset, 'custom'>; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
]

// "atualizado há Xs / Xmin" — recalcula a cada 5s via tick local.
function useRelativeAgo(ts: number): string {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 5_000)
    return () => clearInterval(id)
  }, [])
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (secs < 5) return 'agora mesmo'
  if (secs < 60) return `há ${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `há ${mins}min`
  return `há ${Math.floor(mins / 60)}h`
}

export function DashboardFilters({
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  lastRefreshedAt,
  onManualRefresh,
  refreshing = false,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const ago = useRelativeAgo(lastRefreshedAt)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Fecha o popover custom ao clicar fora.
  useEffect(() => {
    if (!customOpen) return
    function onDoc(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCustomOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [customOpen])

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
      {/* Indicador de atualização + refresh manual */}
      <div className="flex items-center gap-2 order-2 sm:order-1">
        <button
          type="button"
          onClick={onManualRefresh}
          aria-label="Atualizar dados agora"
          title="Atualizar agora"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-caption text-fg-on-dark-muted border transition-colors hover:text-fg-on-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          <ArrowsClockwise
            size={13}
            weight="bold"
            className={refreshing ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          <span className="tabular-nums">atualizado {ago}</span>
        </button>

        {/* Toggle auto-refresh */}
        <button
          type="button"
          role="switch"
          aria-checked={autoRefresh}
          onClick={() => onAutoRefreshChange(!autoRefresh)}
          title={autoRefresh ? 'Auto-refresh ligado (60s)' : 'Auto-refresh desligado'}
          className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-caption font-medium border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
            autoRefresh
              ? 'bg-brand-green/15 text-brand-green border-brand-green/25'
              : 'text-fg-on-dark-subtle'
          }`}
          style={
            autoRefresh
              ? undefined
              : { background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }
          }
        >
          {autoRefresh && <Check size={12} weight="bold" aria-hidden="true" />}
          Auto 60s
        </button>
      </div>

      {/* Seletor de período — tabs */}
      <div
        className="inline-flex p-1 rounded-lg border order-1 sm:order-2 relative"
        style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        role="tablist"
        aria-label="Período de análise"
      >
        {PRESET_OPTIONS.map((opt) => {
          const active = range.preset === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setCustomOpen(false)
                onRangeChange(presetRange(opt.value))
              }}
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

        {/* Botão custom — abre popover com 2 date inputs */}
        <button
          type="button"
          role="tab"
          aria-selected={range.preset === 'custom'}
          aria-haspopup="dialog"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((v) => !v)}
          title="Escolher datas"
          className={`h-8 px-3 rounded-md text-body-sm font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
            range.preset === 'custom'
              ? 'bg-brand-green/15 text-brand-green'
              : 'text-fg-on-dark-muted hover:text-fg-on-dark'
          }`}
        >
          <Calendar size={14} weight="duotone" aria-hidden="true" />
          {range.preset === 'custom' ? range.label : 'Custom'}
        </button>

        {customOpen && (
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Selecionar intervalo customizado"
            className="absolute right-0 top-full mt-2 z-popover w-[min(20rem,90vw)] rounded-lg border p-4 shadow-lg animate-fade-in"
            style={{ background: '#1a1a1a', borderColor: 'var(--app-card-border)' }}
          >
            <CustomRangeForm
              initial={range}
              onApply={(r) => {
                onRangeChange(r)
                setCustomOpen(false)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Form interno do popover: 2 inputs date (de/até) + botão aplicar.
function CustomRangeForm({
  initial,
  onApply,
}: {
  initial: DashboardRange
  onApply: (r: DashboardRange) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const valid = from && to && from <= to

  const inputCls =
    'h-9 w-full rounded-md border bg-white/[0.04] px-2.5 text-body-sm text-fg-on-dark [color-scheme:dark] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green'

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-fg-on-dark-muted">De</span>
          <input
            type="date"
            value={from}
            max={to || today}
            onChange={(e) => setFrom(e.target.value)}
            className={inputCls}
            style={{ borderColor: 'var(--app-card-border)' }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-fg-on-dark-muted">Até</span>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className={inputCls}
            style={{ borderColor: 'var(--app-card-border)' }}
          />
        </label>
      </div>

      {!valid && (
        <p className="text-caption text-amber-400">A data inicial precisa ser anterior à final.</p>
      )}

      <button
        type="button"
        disabled={!valid}
        onClick={() => valid && onApply(customRange(from, to))}
        className="h-9 rounded-md bg-brand-green text-brand-black font-semibold text-body-sm hover:bg-brand-green-bright transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        Aplicar período
      </button>
    </div>
  )
}
