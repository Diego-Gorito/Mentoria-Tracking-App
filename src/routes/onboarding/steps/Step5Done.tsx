// Step5Done.tsx — Tudo pronto! Checklist + CTA Ir pro Dashboard
// autoFocus no botão principal ao montar (via useEffect + ref).
// ul role="list" aria-label + ícones decorativos aria-hidden.

import { useEffect, useRef, useId } from 'react'
import { CheckCircle, Circle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import type { Source } from './Step3Sources'
import type { PlatformId } from '@/routes/settings/platforms'

type ChecklistItemProps = {
  done: boolean
  children: React.ReactNode
}

function ChecklistItem({ done, children }: ChecklistItemProps) {
  return (
    <li className="flex items-start gap-2.5 text-body-sm">
      {done ? (
        <CheckCircle
          size={16}
          weight="fill"
          aria-hidden="true"
          className="text-brand-green shrink-0 mt-0.5"
        />
      ) : (
        <Circle
          size={16}
          aria-hidden="true"
          className="text-fg-on-dark-subtle shrink-0 mt-0.5"
        />
      )}
      <span className={done ? 'text-fg-on-dark' : 'text-fg-on-dark-muted italic'}>
        {children}
      </span>
    </li>
  )
}

type Props = {
  name: string
  slug: string
  trackingVerified: boolean
  sources: Source[]
  configuredPlatforms: PlatformId[]
  saving: boolean
  onComplete: () => void
}

export function Step5Done({
  name,
  slug,
  trackingVerified,
  sources,
  configuredPlatforms,
  saving,
  onComplete,
}: Props) {
  const uid = useId()
  const btnWrapperRef = useRef<HTMLDivElement | null>(null)

  // autoFocus no CTA ao entrar no step
  useEffect(() => {
    const t = setTimeout(() => {
      const btn = btnWrapperRef.current?.querySelector('button')
      btn?.focus()
    }, 100)
    return () => clearTimeout(t)
  }, [])

  const hasPending = !trackingVerified || sources.length === 0 || configuredPlatforms.length === 0

  const sourceLabels: Record<Source, string> = {
    hotmart: 'Hotmart',
    form_web: 'Formulário Web',
    chatwoot: 'Chatwoot',
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="text-center">
      {/* Ícone celebração */}
      <div className="flex justify-center mb-4">
        <CheckCircle
          size={64}
          weight="duotone"
          aria-hidden="true"
          className="text-brand-green"
          style={{ '--phosphor-duotone-secondary-opacity': '0.25' } as React.CSSProperties}
        />
      </div>

      <h2 id={`${uid}-title`} className="text-h2 font-semibold text-fg-on-dark mb-2">
        Tudo pronto!
      </h2>
      <p className="text-body-md text-fg-on-dark-muted mb-8 max-w-md mx-auto">
        {hasPending
          ? 'Setup concluído. Algumas configurações ainda podem ser feitas depois.'
          : 'Seu painel de tracking está configurado e pronto para usar.'}
      </p>

      {/* Checklist resumo */}
      <section
        aria-label="Resumo do que foi configurado"
        className="text-left max-w-sm mx-auto mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-5"
      >
        <p className="text-body-sm font-medium text-fg-on-dark-muted mb-3">
          O que foi configurado:
        </p>
        <ul role="list" className="flex flex-col gap-2.5">
          {/* Escola — sempre done */}
          <ChecklistItem done>
            Escola: {name} ({slug})
          </ChecklistItem>

          {/* GTM */}
          <ChecklistItem done={trackingVerified}>
            {trackingVerified
              ? 'Snippet GTM instalado e recebendo eventos'
              : 'Snippet GTM não verificado — confirme em Configurações depois'}
          </ChecklistItem>

          {/* Fontes */}
          <ChecklistItem done={sources.length > 0}>
            {sources.length > 0
              ? `Fontes: ${sources.map((s) => sourceLabels[s]).join(', ')}`
              : 'Fontes de conversão não configuradas'}
          </ChecklistItem>

          {/* Plataformas */}
          <ChecklistItem done={configuredPlatforms.length > 0}>
            {configuredPlatforms.length > 0
              ? `${configuredPlatforms.length} plataforma${configuredPlatforms.length !== 1 ? 's' : ''} de anúncios conectada${configuredPlatforms.length !== 1 ? 's' : ''}`
              : 'Nenhuma plataforma de anúncios configurada'}
          </ChecklistItem>
        </ul>
      </section>

      {/* CTA principal */}
      <div className="flex flex-col items-center gap-3">
        <div ref={btnWrapperRef}>
          <Button
            size="lg"
            type="button"
            onClick={onComplete}
            loading={saving}
          >
            {saving ? 'Preparando seu painel...' : 'Ir pro Dashboard'}
          </Button>
        </div>
        {hasPending && (
          <a
            href="/settings"
            className="text-body-sm text-fg-on-dark-muted hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded"
          >
            Configurar o que ficou para depois
          </a>
        )}
      </div>
    </section>
  )
}
