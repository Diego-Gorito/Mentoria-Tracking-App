// InstallProgressModal.tsx — F-S09 AC-3
// Modal full-screen não-fechável com 4 steps animados.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 5 + UX-003 (Esc disabled).
// A11y: role=dialog aria-modal aria-busy aria-live=polite + useFocusTrap.

import { useEffect, useRef, type ReactNode } from 'react'
import { CheckCircle, XCircle, Circle, Spinner } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/lib/useFocusTrap'
import type { InstallStep } from '@/types/sites'

type Props = {
  isOpen: boolean
  /** 4 steps fixos: Conectando Hostinger / Instalando plugin / Validando dataLayer / Registrando audit log. */
  steps: InstallStep[]
  /** Index do step em andamento (0-based). */
  currentStep: number
  /** Domain visível no header (mono, text-muted). */
  domain?: string
  /** Total estimated em segundos pra footer hint. Default 30s per UX §3 Tela 5. */
  estimatedSeconds?: number
  /** Emergency close pós-fail (botão visível só após error). */
  onForceClose?: () => void
  /** Se algum step falhou — mostra botão fechar de emergência. */
  hasFailed?: boolean
}

/** 4 steps fixos pra UX consistente (AC-3). */
export const DEFAULT_INSTALL_STEPS: InstallStep[] = [
  { label: 'Conectando com Hostinger', status: 'pending' },
  { label: 'Instalando plugin GTM4WP', status: 'pending' },
  { label: 'Validando dataLayer', status: 'pending' },
  { label: 'Registrando audit log', status: 'pending' },
]

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function StepIcon({
  status,
  reduceMotion,
}: {
  status: InstallStep['status']
  reduceMotion: boolean
}): ReactNode {
  switch (status) {
    case 'done':
      return (
        <CheckCircle
          size={20}
          weight="fill"
          className="text-success"
          aria-label="Concluído"
        />
      )
    case 'failed':
      return <XCircle size={20} weight="fill" className="text-danger" aria-label="Falhou" />
    case 'in_progress':
      return reduceMotion ? (
        <Spinner size={20} weight="bold" className="text-info" aria-label="Em andamento" />
      ) : (
        <Spinner
          size={20}
          weight="bold"
          className="text-info animate-spin"
          aria-label="Em andamento"
        />
      )
    case 'pending':
    default:
      return (
        <Circle
          size={20}
          weight="regular"
          className="text-fg-on-light-subtle"
          aria-label="Pendente"
        />
      )
  }
}

export function InstallProgressModal({
  isOpen,
  steps,
  currentStep,
  domain,
  estimatedSeconds = 30,
  onForceClose,
  hasFailed = false,
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = prefersReducedMotion()

  // UX-003: Esc disabled durante install (so onEscape no-op).
  // Pós-fail (hasFailed=true), Esc volta a permitir close via onForceClose.
  const handleEscape = hasFailed && onForceClose ? onForceClose : undefined
  useFocusTrap(dialogRef, isOpen, handleEscape)

  // Bloqueia scroll body enquanto modal aberto.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen) return null

  // Progress % = (done count) / total
  const doneCount = steps.filter((s) => s.status === 'done').length
  const total = steps.length || 1
  const pct = Math.round((doneCount / total) * 100)

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-progress-title"
        aria-busy={!hasFailed}
        className={cn(
          'relative w-full max-w-lg rounded-xl bg-white text-fg-on-light shadow-xl border border-border-default overflow-hidden',
          !reduceMotion && 'animate-fade-up',
        )}
      >
        <div className="p-7 flex flex-col gap-5">
          <div className="text-center">
            <h2
              id="install-progress-title"
              className="text-h3 font-semibold text-brand-black"
            >
              Instalando tracking…
            </h2>
            {domain && (
              <p className="mt-2 text-caption font-mono text-fg-on-light-muted">{domain}</p>
            )}
          </div>

          <ol
            aria-live="polite"
            aria-atomic="false"
            className="flex flex-col gap-3"
          >
            {steps.map((step, idx) => {
              const isCurrent = idx === currentStep && step.status === 'in_progress'
              return (
                <li
                  key={`${step.label}-${idx}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="flex items-center gap-3 text-body-sm text-fg-on-light"
                >
                  <span className="shrink-0">
                    <StepIcon status={step.status} reduceMotion={reduceMotion} />
                  </span>
                  <span className="flex-1 min-w-0">{step.label}</span>
                  <span className="text-caption font-mono text-fg-on-light-muted tabular-nums">
                    {step.status === 'done' && typeof step.durationMs === 'number' && (
                      <>{(step.durationMs / 1000).toFixed(1)}s</>
                    )}
                    {step.status === 'in_progress' && '(em andamento)'}
                    {step.status === 'failed' && (
                      <span className="text-danger-text">(falhou)</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>

          <div className="flex flex-col gap-1.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Progresso da instalação"
              className="h-2 rounded-full bg-bg-muted overflow-hidden"
            >
              <div
                className={cn(
                  'h-full bg-brand-green rounded-full',
                  !reduceMotion && 'transition-[width] duration-base',
                  reduceMotion && 'transition-none',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-caption text-fg-on-light-muted tabular-nums">{pct}%</p>
          </div>

          <p className="text-caption text-fg-on-light-muted italic text-center">
            Não feche esta janela. Estimado ~{estimatedSeconds}s no total.
          </p>

          {hasFailed && onForceClose && (
            <button
              type="button"
              onClick={onForceClose}
              data-autofocus
              className={cn(
                'mx-auto h-10 px-5 rounded-md text-body-sm font-medium',
                'border border-border-default bg-white text-brand-black',
                'hover:bg-bg-muted active:bg-zinc-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
                'transition-colors',
              )}
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
