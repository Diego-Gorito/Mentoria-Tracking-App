// Step4Ads.tsx — Contas de Anúncios: grid de 6 plataformas + modal
// Reutiliza IntegrationModal. Destaque dinâmico por sources do step 3.
// Focus management: ao fechar modal → foca no card btn via data-platformid.

import { useId, useRef, useState } from 'react'
import { IntegrationModal } from '@/routes/settings/IntegrationModal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { PLATFORM_META, PLATFORM_ORDER, type PlatformId } from '@/routes/settings/platforms'

type Props = {
  sources: string[]
  configuredPlatforms: PlatformId[]
  onConfigured: (platforms: PlatformId[]) => void
  onSkipAll: () => void
}

export function Step4Ads({ sources, configuredPlatforms, onConfigured, onSkipAll }: Props) {
  const uid = useId()
  const [modalPlatform, setModalPlatform] = useState<PlatformId | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  function openModal(id: PlatformId) {
    setModalPlatform(id)
  }

  function closeModal() {
    const prev = modalPlatform
    setModalPlatform(null)
    // Retorna foco ao botão do card correspondente
    if (prev) {
      requestAnimationFrame(() => {
        const btn = gridRef.current?.querySelector<HTMLButtonElement>(
          `[data-platformid="${prev}"]`,
        )
        btn?.focus()
      })
    }
  }

  function handleSaved(id: PlatformId) {
    if (!configuredPlatforms.includes(id)) {
      onConfigured([...configuredPlatforms, id])
    }
    closeModal()
  }

  const count = configuredPlatforms.length

  return (
    <section aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="text-h2 font-semibold text-fg-on-dark mb-1">
        Contas de Anúncios
      </h2>
      <p className="text-body-md text-fg-on-dark-muted mb-2">
        Conecte as plataformas onde você anuncia para enviar conversões enriquecidas.
      </p>
      <button
        type="button"
        onClick={onSkipAll}
        className="text-body-sm text-fg-on-dark-muted hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded mb-6"
      >
        Pular tudo e configurar depois em Integrações
      </button>

      {/* Grid de plataformas */}
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {PLATFORM_ORDER.map((id) => {
          const meta = PLATFORM_META[id]
          const configured = configuredPlatforms.includes(id)
          const isRecommended =
            (id === 'hotmart' && sources.includes('hotmart')) ||
            (id === 'chatwoot' && sources.includes('chatwoot'))
          const isAlwaysHighlight = id === 'meta_capi'

          return (
            <article
              key={id}
              aria-label={`Integração ${meta.label} — ${configured ? 'Configurado' : 'Não configurado'}`}
              className={`rounded-xl border p-4 flex flex-col gap-3 transition-all hover:shadow-card-hover ${
                configured
                  ? 'border-brand-green/20 bg-brand-green/[0.04]'
                  : isRecommended
                    ? 'border-amber-500/20 bg-amber-500/[0.02]'
                    : isAlwaysHighlight
                      ? 'border-white/[0.15] bg-white/[0.03]'
                      : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{meta.emoji}</span>
                  <span className="font-medium text-body-md text-fg-on-dark">{meta.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {configured && <StatusBadge status="success">Configurado</StatusBadge>}
                  {!configured && isRecommended && <StatusBadge status="warning">Recomendado</StatusBadge>}
                  {!configured && isAlwaysHighlight && !isRecommended && (
                    <StatusBadge status="neutral">Popular</StatusBadge>
                  )}
                </div>
              </div>

              {/* Descrição */}
              <p className="text-body-sm text-fg-on-dark-muted">{meta.description}</p>

              {/* Ação */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  data-platformid={id}
                  onClick={() => openModal(id)}
                >
                  {configured ? 'Editar' : 'Conectar'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>

      {/* Contagem */}
      <p className="text-caption text-fg-on-dark-subtle text-center">
        {count} de {PLATFORM_ORDER.length} plataformas configuradas
      </p>

      {/* Modal */}
      {modalPlatform && (
        <IntegrationModal
          platformId={modalPlatform}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </section>
  )
}
