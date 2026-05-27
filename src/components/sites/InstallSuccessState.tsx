// InstallSuccessState.tsx — F-S09 AC-4
// Tela success pós-install. Checkmark animado + 4 checklist verdes + 4 CTAs.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 6 + UX-006 + UX-008 (sem confetti).
// A11y: aria-live=polite no title, foco automático em "Abrir site".

import { useEffect, useRef } from 'react'
// useRef pra section (focus automático no botão "Abrir site" via querySelector).
import { ArrowSquareOut, CheckCircle, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { BRAND_LABELS } from './BrandSelect'
import type { BrandSlug } from '@/types/sites'

export type SuccessAction = 'open_site' | 'view_audit' | 'install_another' | 'back_to_list'

type Props = {
  domain: string
  containerId: string
  brandSlug?: BrandSlug
  /** Duração total da install em segundos (mono mostra "28 segundos"). */
  durationSec: number
  /** Callback agnóstico — caller mapeia pra navegação. */
  onAction: (action: SuccessAction) => void
  className?: string
}

const CHECKLIST: string[] = [
  'Plugin GTM4WP ativo',
  'dataLayer detectado no DOM',
  'Container ID configurado corretamente',
  'Audit log registrado',
]

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function InstallSuccessState({
  domain,
  containerId,
  brandSlug,
  durationSec,
  onAction,
  className,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const reduceMotion = prefersReducedMotion()
  const brandLabel = brandSlug ? BRAND_LABELS[brandSlug] : null

  // UX §3 Tela 6 A11y: foco automático no botão "Abrir site" (next likely action).
  useEffect(() => {
    const el = sectionRef.current?.querySelector<HTMLButtonElement>('[data-autofocus]')
    el?.focus()
  }, [])

  return (
    <section
      ref={sectionRef}
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center text-center gap-5 py-10 px-6 max-w-xl mx-auto',
        className,
      )}
    >
      {/* Checkmark — scale 0→1.2→1.0 em 400ms ease-out-back. Reduce motion = estático. */}
      <div
        aria-hidden="true"
        className={cn(
          'h-20 w-20 rounded-full bg-success/10 border border-success/30 flex items-center justify-center',
          !reduceMotion && 'animate-[fade-up_400ms_cubic-bezier(0.34,1.56,0.64,1)]',
        )}
        style={
          !reduceMotion
            ? { animation: 'success-pop 400ms cubic-bezier(0.34,1.56,0.64,1)' }
            : undefined
        }
      >
        <CheckCircle size={64} weight="fill" className="text-success" />
      </div>

      <style>{`
        @keyframes success-pop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div className="flex flex-col gap-2">
        <h2 className="text-h2 font-semibold text-brand-black">
          Tracking instalado com sucesso!
        </h2>
        <p className="text-body-md text-fg-on-light-muted">
          <span className="font-mono text-brand-black">{domain}</span> agora coleta eventos via
          GTM Container <span className="font-mono text-brand-black">{containerId}</span>
          {brandLabel ? <> (brand {brandLabel}).</> : <>.</>}
        </p>
      </div>

      <ul className="flex flex-col gap-2 self-stretch text-left max-w-md mx-auto">
        {CHECKLIST.map((line) => (
          <li key={line} className="flex items-center gap-2.5 text-body-sm text-fg-on-light">
            <Check size={16} weight="bold" className="text-success shrink-0" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p className="text-caption font-mono text-fg-on-light-muted tabular-nums">
        Tempo total: {durationSec} segundos
      </p>

      {/* 4 CTAs (UX-006) — primary "Abrir site" + 3 outros. */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 justify-center w-full">
        <Button
          variant="primary"
          size="md"
          onClick={() => onAction('open_site')}
          data-autofocus
          className="min-h-[44px]"
        >
          Abrir site
          <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => onAction('view_audit')}
          className="min-h-[44px]"
        >
          Ver audit log
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => onAction('install_another')}
          className="min-h-[44px]"
        >
          Instalar em outro site
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={() => onAction('back_to_list')}
          className="min-h-[44px]"
        >
          Voltar à lista
        </Button>
      </div>
    </section>
  )
}
