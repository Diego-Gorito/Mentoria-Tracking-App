// InstallFailureState.tsx — F-S09 AC-5
// Tela failure pós-install. X vermelho + erro copiável + sugestões numeradas + 4 CTAs.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 7 + UX-007 (ID erro copiável).
// A11y: role="alert" anuncia imediato, <pre> com aria-label, foco automático em "Tentar novamente".

import { useEffect, useRef, useState } from 'react'
import { Copy, XCircle, Check as CheckIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export type FailureAction = 'retry' | 'reconnect' | 'copy_id' | 'cancel'

type Props = {
  domain: string
  errorCode: string
  errorMessage: string
  errorId: string
  /** Lista de "O que tentar" — passos concretos. */
  suggestions: string[]
  /** Callback agnóstico — caller mapeia pra navegação. */
  onAction: (action: FailureAction) => void
  /** Avisa caller ao copiar (toast "ID do erro copiado"). */
  onCopySuccess?: () => void
  className?: string
}

export function InstallFailureState({
  domain,
  errorCode,
  errorMessage,
  errorId,
  suggestions,
  onAction,
  onCopySuccess,
  className,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState(false)

  // UX §3 Tela 7 A11y: foco em "Tentar novamente" (most likely recovery).
  useEffect(() => {
    const el = sectionRef.current?.querySelector<HTMLButtonElement>('[data-autofocus]')
    el?.focus()
  }, [])

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(errorId)
        setCopied(true)
        onCopySuccess?.()
        // Reset visual após 2s.
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Clipboard pode falhar em iframes; chama action mesmo assim.
    }
    onAction('copy_id')
  }

  return (
    <section
      ref={sectionRef}
      role="alert"
      aria-labelledby="failure-title"
      className={cn(
        'flex flex-col items-center text-center gap-5 py-10 px-6 max-w-2xl mx-auto',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="h-20 w-20 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center"
      >
        <XCircle size={64} weight="fill" className="text-danger" />
      </div>

      <div className="flex flex-col gap-2">
        <h2 id="failure-title" className="text-h2 font-semibold text-brand-black">
          Não consegui instalar o tracking
        </h2>
        <p className="text-body-md font-mono text-fg-on-light-muted">{domain}</p>
      </div>

      <div className="self-stretch flex flex-col gap-2 text-left">
        <span className="text-caption font-medium text-fg-on-light-muted uppercase tracking-wide">
          Detalhe técnico
        </span>
        <pre
          aria-label="Detalhe técnico do erro"
          className="bg-bg-muted rounded-md p-4 text-caption font-mono text-fg-on-light whitespace-pre-wrap break-all"
        >
          {`${errorCode}: ${errorMessage}\nID do erro: ${errorId}`}
        </pre>
      </div>

      {suggestions.length > 0 && (
        <div className="self-stretch flex flex-col gap-2 text-left">
          <span className="text-caption font-medium text-fg-on-light-muted uppercase tracking-wide">
            O que tentar
          </span>
          <ol className="flex flex-col gap-2 list-none">
            {suggestions.map((s, idx) => (
              <li key={idx} className="flex gap-3 text-body-sm text-fg-on-light leading-relaxed">
                <span
                  aria-hidden="true"
                  className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-bg-muted text-fg-on-light-muted font-mono text-caption font-semibold"
                >
                  {idx + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 4 CTAs contextuais (AC-5). */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 justify-center w-full">
        <Button
          variant="primary"
          size="md"
          onClick={() => onAction('retry')}
          data-autofocus
          className="min-h-[44px]"
        >
          Tentar novamente
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => onAction('reconnect')}
          className="min-h-[44px]"
        >
          Reconectar Hostinger
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={handleCopy}
          aria-label="Copiar ID do erro"
          className="min-h-[44px]"
        >
          {copied ? (
            <>
              <CheckIcon size={14} weight="bold" aria-hidden="true" />
              Copiado
            </>
          ) : (
            <>
              <Copy size={14} weight="bold" aria-hidden="true" />
              Copiar ID
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={() => onAction('cancel')}
          className="min-h-[44px]"
        >
          Voltar
        </Button>
      </div>
    </section>
  )
}
