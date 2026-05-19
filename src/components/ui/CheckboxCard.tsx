// CheckboxCard.tsx — card de checkbox com área de toque completa (WCAG AA)
// <label> envolve o card inteiro → toque em qualquer ponto alterna.
// Estado checked: border-brand-green/30 bg-brand-green/[0.05]
// Estado unchecked: border-white/10 bg-white/[0.02] hover:bg-white/[0.04]

import { Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Props = {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  icon?: ReactNode
  badge?: ReactNode
  className?: string
}

export function CheckboxCard({
  id,
  checked,
  onChange,
  label,
  description,
  icon,
  badge,
  className,
}: Props) {
  const descId = description ? `${id}-desc` : undefined

  return (
    <label
      htmlFor={id}
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-xl border cursor-pointer select-none',
        'transition-colors duration-fast',
        'focus-within:outline focus-within:outline-2 focus-within:outline-brand-green focus-within:outline-offset-2',
        // Touch target mínimo 44px — padding garante isso via container
        checked
          ? 'border-brand-green/30 bg-brand-green/[0.05]'
          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]',
        className,
      )}
    >
      {/* Input checkbox real — visualmente oculto mas acessível */}
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={descId}
        className="sr-only"
      />

      {/* Checkbox visual */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors duration-fast',
          checked
            ? 'border-brand-green bg-brand-green'
            : 'border-white/20 bg-transparent',
        )}
      >
        {checked && <Check size={12} weight="bold" className="text-brand-black" />}
      </span>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {icon && (
            <span className="shrink-0 text-fg-on-dark-muted" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="font-medium text-body-md text-fg-on-dark">{label}</span>
          {badge}
        </div>
        {description && (
          <p id={descId} className="mt-0.5 text-body-sm text-fg-on-dark-muted">
            {description}
          </p>
        )}
      </div>
    </label>
  )
}
