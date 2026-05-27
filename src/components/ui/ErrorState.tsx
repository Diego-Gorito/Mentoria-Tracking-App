// ErrorState.tsx — feedback de erro com retry opcional.
// Reusa design tokens do EmptyState (border, card-bg, fg-on-dark).
// A11y: role="alert" pra leitores de tela captarem sem foco.

import { WarningCircle } from '@phosphor-icons/react'

type Props = {
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  message = 'Falha ao carregar dados. Tente novamente.',
  onRetry,
  className = '',
}: Props) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-3 py-10 px-6 text-center ${className}`}
    >
      <div
        className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20"
        aria-hidden="true"
      >
        <WarningCircle
          size={28}
          weight="duotone"
          className="text-red-400"
          style={{ '--phosphor-duotone-secondary-opacity': '0.35' } as React.CSSProperties}
        />
      </div>

      <p className="text-body-sm text-fg-on-dark-muted max-w-xs">{message}</p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-8 px-4 rounded-lg text-body-sm font-medium text-fg-on-dark border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
