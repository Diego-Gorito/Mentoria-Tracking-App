// Field.tsx — label + Input + hint + error (padrão ERP configuracoes.tsx)
// Cada Field é autônomo: label, descrição e mensagem de erro co-locados.
// WCAG AA: htmlFor/id linkados, aria-describedby pra hint/error, role="alert" no erro.

import type { ReactNode } from 'react'
import { Input } from './Input'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string
  label: string
  hint?: string
  error?: string
  suffix?: ReactNode   // ex: badge de slug preview ao lado do label
  className?: string
}

export function Field({ id, label, hint, error, suffix, className, ...inputProps }: Props) {
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-body-sm font-medium text-fg-on-dark-muted"
        >
          {label}
        </label>
        {suffix}
      </div>

      <Input
        id={id}
        hasError={!!error}
        aria-describedby={describedBy}
        {...inputProps}
      />

      {hint && !error && (
        <p id={hintId} className="text-caption text-fg-on-dark-subtle">
          {hint}
        </p>
      )}

      {error && (
        <p id={errId} role="alert" className="text-caption text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
