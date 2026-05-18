// Input.tsx — wrapper consistente sobre <input> (mesma anatomia do ERP Field)
// Aplica classe `stitch-input` do globals.css + tokens de cor via CSS vars.
// WCAG AA: label obrigatório via htmlFor no Field pai, aria-invalid propagado.

import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { hasError, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={hasError ? 'true' : undefined}
      className={cn(
        // Base
        'w-full h-10 px-3 rounded-md text-body-sm transition-colors',
        // Surface + border — usa CSS vars do dark theme
        'bg-white/[0.04] border border-white/10',
        'text-fg-on-dark placeholder:text-fg-on-dark-subtle',
        // Focus ring verde
        'focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green',
        // Erro
        hasError && 'border-red-500/60 focus:ring-red-500/30 focus:border-red-500',
        // Disabled
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  )
})
