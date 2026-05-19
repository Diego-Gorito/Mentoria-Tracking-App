// Step3Sources.tsx — Fontes de Conversão: Hotmart, Formulário Web, Chatwoot
// fieldset + legend. CheckboxCard cobre área de toque completa.
// Alerta se tentar avançar sem seleção (role=alert).

import { useId, useState } from 'react'
import { ShoppingBag, Laptop, ChatCircle } from '@phosphor-icons/react'
import { CheckboxCard } from '@/components/ui/CheckboxCard'
import { StatusBadge } from '@/components/ui/StatusBadge'

export type Source = 'hotmart' | 'form_web' | 'chatwoot'

export type Step3Data = {
  sources: Source[]
  formPlatform?: string
}

const FORM_PLATFORMS = ['Elementor', 'WPForms', 'Gravity Forms', 'HTML puro']

type Props = {
  initial: Step3Data
  showAlert: boolean
  onChange: (data: Step3Data) => void
}

export function Step3Sources({ initial, showAlert, onChange }: Props) {
  const uid = useId()
  const [sources, setSources] = useState<Source[]>(initial.sources)
  const [formPlatform, setFormPlatform] = useState<string>(initial.formPlatform ?? '')

  function toggleSource(s: Source, checked: boolean) {
    const next = checked ? [...sources, s] : sources.filter((x) => x !== s)
    setSources(next)
    onChange({ sources: next, formPlatform: formPlatform || undefined })
  }

  function handleFormPlatform(p: string) {
    const next = formPlatform === p ? '' : p
    setFormPlatform(next)
    onChange({ sources, formPlatform: next || undefined })
  }

  return (
    <section aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="text-h2 font-semibold text-fg-on-dark mb-1">
        Fontes de Conversão
      </h2>
      <p className="text-body-md text-fg-on-dark-muted mb-6">
        De onde chegam as compras e leads que você quer rastrear? Selecione todas que se aplicam.
      </p>

      <fieldset className="border-0 p-0 m-0">
        <legend className="text-body-sm text-fg-on-dark-muted mb-3">
          Selecione todas as fontes que você usa:
        </legend>

        <div className="flex flex-col gap-3">
          {/* Hotmart */}
          <div className="relative">
            <CheckboxCard
              id={`${uid}-hotmart`}
              checked={sources.includes('hotmart')}
              onChange={(v) => toggleSource('hotmart', v)}
              label="Hotmart"
              description="Vendas de cursos ou produtos digitais na plataforma Hotmart"
              icon={<ShoppingBag size={20} />}
              badge={
                <StatusBadge status="success">Mais popular</StatusBadge>
              }
            />
          </div>

          {/* Formulário Web */}
          <div>
            <CheckboxCard
              id={`${uid}-form`}
              checked={sources.includes('form_web')}
              onChange={(v) => toggleSource('form_web', v)}
              label="Formulário Web"
              description="Leads captados por formulários no seu site (Elementor, WPForms ou HTML)"
              icon={<Laptop size={20} />}
            />
            {/* Chips de plataforma — aparecem quando selecionado */}
            {sources.includes('form_web') && (
              <div
                role="group"
                aria-label="Plataforma de formulários"
                className="mt-2 ml-4 flex flex-wrap gap-2"
              >
                <p className="w-full text-body-sm text-fg-on-dark-muted">
                  Qual plataforma de formulários você usa?
                </p>
                {FORM_PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleFormPlatform(p)}
                    aria-pressed={formPlatform === p}
                    className={`h-8 px-3 rounded-full text-body-sm border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                      formPlatform === p
                        ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                        : 'border-white/10 bg-white/[0.02] text-fg-on-dark-muted hover:bg-white/[0.06]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chatwoot */}
          <CheckboxCard
            id={`${uid}-chatwoot`}
            checked={sources.includes('chatwoot')}
            onChange={(v) => toggleSource('chatwoot', v)}
            label="Chatwoot"
            description="Pontua leads com base em eventos de atendimento no chat"
            icon={<ChatCircle size={20} />}
            badge={<StatusBadge status="info">Beta</StatusBadge>}
          />
        </div>
      </fieldset>

      {/* Alerta nenhuma seleção */}
      {showAlert && sources.length === 0 && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-body-sm text-fg-on-dark"
        >
          Selecione pelo menos uma fonte para continuar. Se não tiver certeza, escolha a que planeja usar primeiro.
        </div>
      )}
    </section>
  )
}
