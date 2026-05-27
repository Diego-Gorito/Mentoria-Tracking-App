// TokenInput.tsx — F-S09 AC-6
// Input password com eye toggle (mitiga shoulder-surfing per UX-011).
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 2 + UX-011.
// A11y: aria-pressed no toggle, aria-label="Mostrar/ocultar token", aria-invalid em error.

import { useId, useState, type ChangeEvent, type ClipboardEvent } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (v: string) => void
  /** Mensagem de erro inline (border vermelho + aria-invalid). */
  error?: string
  /** Hint debaixo do field — UX padrão "Seu token é criptografado antes de salvar." */
  hint?: string
  /** Label visível acima do input. */
  label?: string
  /** Disabled durante submit. */
  disabled?: boolean
  /** Id pro <label htmlFor>. Default useId(). */
  id?: string
  className?: string
  /** AutoFocus quando entra na tela (UX §5.2 keyboard). */
  autoFocus?: boolean
}

export function TokenInput({
  value,
  onChange,
  error,
  hint = 'Seu token é criptografado antes de salvar.',
  label = 'Token API Hostinger',
  disabled = false,
  id,
  className,
  autoFocus = false,
}: Props) {
  const [visible, setVisible] = useState(false)
  const reactId = useId()
  const inputId = id ?? `token-input-${reactId}`
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  // UX Edge case 5: trim automático em paste (whitespace pode quebrar API).
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    const trimmed = pasted.trim()
    if (trimmed !== pasted) {
      e.preventDefault()
      onChange(trimmed)
    }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-body-sm font-medium text-fg-on-light">
        {label}
      </label>

      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          // NÃO usa placeholder com exemplo token (UX §3 Tela 2 explicit — leak risk).
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'w-full min-h-[44px] h-11 pl-3 pr-12 rounded-md border text-body-sm text-brand-black',
            'bg-white placeholder:text-fg-on-light-subtle',
            'focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green',
            'disabled:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-60',
            'transition-colors',
            error
              ? 'border-danger focus:ring-danger/30 focus:border-danger'
              : 'border-border-default',
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar token' : 'Mostrar token'}
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2',
            // 44×44 tap target (UX §5.4 mobile)
            'inline-flex items-center justify-center h-10 w-10 rounded-md',
            'text-fg-on-light-muted hover:text-brand-black hover:bg-bg-muted active:bg-zinc-200',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-colors',
          )}
        >
          {visible ? <EyeSlash size={18} weight="regular" /> : <Eye size={18} weight="regular" />}
        </button>
      </div>

      {hint && !error && (
        <p id={hintId} className="text-caption text-fg-on-light-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
