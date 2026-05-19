// CodeBlock.tsx — bloco <pre> com botão Copiar + feedback 2s (WCAG AA)
// role="region" + aria-label. Botão Copiar: ícone Copy → CheckCircle por 2s.
// NÃO modificar syntax highlight externo — usa mono font + text-brand-green.

import { useState, useRef } from 'react'
import { Copy, CheckCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type Props = {
  code: string
  label?: string
  ariaLabel?: string
  className?: string
}

export function CodeBlock({ code, label, ariaLabel = 'Bloco de código para copiar', className }: Props) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // fallback: execCommand (legado)
      const ta = document.createElement('textarea')
      ta.value = code
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Header: label + botão copiar */}
      <div className="flex items-center justify-between">
        {label && (
          <span className="text-caption text-fg-on-dark-muted">{label}</span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copiado!' : 'Copiar código'}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-caption font-medium transition-all duration-base',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
            copied
              ? 'text-brand-green bg-brand-green/10'
              : 'text-fg-on-dark-muted hover:text-fg-on-dark hover:bg-white/[0.06]',
          )}
        >
          {copied ? (
            <>
              <CheckCircle size={13} weight="fill" aria-hidden="true" />
              <span>Copiado!</span>
            </>
          ) : (
            <>
              <Copy size={13} aria-hidden="true" />
              <span>Copiar código</span>
            </>
          )}
        </button>
      </div>

      {/* Bloco de código */}
      <pre
        role="region"
        aria-label={ariaLabel}
        className="bg-black/40 rounded-xl p-4 text-brand-green text-body-sm overflow-x-auto tabular-nums font-mono leading-relaxed whitespace-pre-wrap break-all"
      >
        {code}
      </pre>
    </div>
  )
}
