// Onboarding Wizard — 5 steps
// Step 1 (Brand): nome, slug, URL, logo preview, cor preset — implementado
// Steps 2-5: placeholder "Em construcao"
// WCAG AA: labels, aria-*, focus ring. 300 linhas max.

import { useState, useId, useRef, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toast'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'

const STEPS = [
  { id: 1, label: 'Sua Escola',          short: 'Brand' },
  { id: 2, label: 'Script de Tracking',  short: 'Tracking' },
  { id: 3, label: 'Conversoes',          short: 'Conversoes' },
  { id: 4, label: 'Contas de Anuncios',  short: 'Ads' },
  { id: 5, label: 'Pronto!',             short: 'Done' },
]

const COLOR_PRESETS = [
  { label: 'Verde',   value: '#16DF6F', var: '--brand-green', bg: 'bg-[#16DF6F]' },
  { label: 'Azul',    value: '#3B82F6', var: '--brand-green', bg: 'bg-blue-500' },
  { label: 'Roxo',    value: '#8B5CF6', var: '--brand-green', bg: 'bg-violet-500' },
  { label: 'Laranja', value: '#F97316', var: '--brand-green', bg: 'bg-orange-500' },
]

const SLUG_CONFLICTS = new Set(['mentoria', 'zerohum', 'ifrn'])

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

type Props = {
  onComplete?: () => void
  onNavigate?: (href: string) => void
}

export function Wizard({ onComplete, onNavigate }: Props) {
  const uid = useId()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1 state — pré-popula do signup localStorage
  const [nome, setNome] = useState(() => localStorage.getItem('mentoria-tracking.signup-company') ?? '')
  const [slug, setSlug] = useState(() => localStorage.getItem('mentoria-tracking.signup-slug') ?? '')
  const [slugManual, setSlugManual] = useState(false)
  const [slugConflict, setSlugConflict] = useState(false)
  const [url, setUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [colorIdx, setColorIdx] = useState(0)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Aplica cor preset no CSS var
  useEffect(() => {
    document.documentElement.style.setProperty('--brand-green', COLOR_PRESETS[colorIdx].value)
  }, [colorIdx])

  // Auto-slug quando nome muda (se nao editado manualmente)
  useEffect(() => {
    if (!slugManual) setSlug(slugify(nome))
  }, [nome, slugManual])

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleSlugChange(v: string) {
    setSlugManual(true)
    const clean = slugify(v)
    setSlug(clean)
    setSlugConflict(SLUG_CONFLICTS.has(clean))
  }

  function blurSlug() {
    setTouched((t) => ({ ...t, slug: true }))
    if (slug === 'demo' || slug === 'test') setSlugConflict(false)
    else setSlugConflict(SLUG_CONFLICTS.has(slug))
  }

  const slugError =
    (touched.slug && !slug)
      ? 'Slug obrigatorio'
      : slugConflict
        ? 'Este slug ja esta em uso. Escolha outro.'
        : undefined

  const nomeError = touched.nome && !nome.trim() ? 'Nome obrigatorio' : undefined

  async function saveStep1() {
    setTouched({ nome: true, slug: true })
    if (!nome.trim() || !slug || slugConflict) return
    setSaving(true)
    await new Promise((r) => setTimeout(r, 500))
    localStorage.setItem('mentoria-tracking.wizard-nome', nome.trim())
    localStorage.setItem('mentoria-tracking.wizard-slug', slug)
    localStorage.setItem('mentoria-tracking.wizard-url', url)
    localStorage.setItem('mentoria-tracking.wizard-color', COLOR_PRESETS[colorIdx].value)
    if (logoFile) localStorage.setItem('mentoria-tracking.wizard-logo-name', logoFile.name)
    toast('Etapa 1 salva!', 'success')
    setSaving(false)
    setCurrentStep(2)
  }

  function nextStep() {
    if (currentStep === 1) { saveStep1(); return }
    if (currentStep === STEPS.length) { onComplete?.(); return }
    setCurrentStep((s) => s + 1)
  }

  function prevStep() {
    if (currentStep > 1) setCurrentStep((s) => s - 1)
  }

  const isLast = currentStep === STEPS.length

  return (
    <AppShell activePath="/onboarding" onNavigate={onNavigate}>
      <div className="max-w-2xl mx-auto">

        {/* Progress header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status="info">Onboarding</StatusBadge>
            <span className="text-body-sm text-fg-on-dark-muted">
              Passo {currentStep} de {STEPS.length}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden" role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={STEPS.length}>
            <div
              className="h-full rounded-full bg-brand-green transition-all duration-slow"
              style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps nav */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2" role="tablist">
          {STEPS.map((s) => {
            const isDone = s.id < currentStep
            const isActive = s.id === currentStep
            return (
              <div
                key={s.id}
                role="tab"
                aria-selected={isActive}
                aria-label={`Etapa ${s.id}: ${s.label}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                    : isDone
                      ? 'text-fg-on-dark-muted'
                      : 'text-fg-on-dark-subtle'
                }`}
              >
                {isDone ? (
                  <CheckCircle size={14} weight="fill" className="text-brand-green shrink-0" />
                ) : (
                  <span
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-caption font-mono shrink-0 ${
                      isActive ? 'bg-brand-green text-brand-black' : 'bg-white/[0.08]'
                    }`}
                    aria-hidden="true"
                  >
                    {s.id}
                  </span>
                )}
                <span className="hidden sm:inline">{s.short}</span>
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div
          className="rounded-xl border p-8 mb-6"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          {currentStep === 1 && (
            <section aria-labelledby={`${uid}-step1-title`}>
              <h2 id={`${uid}-step1-title`} className="text-h2 font-semibold text-fg-on-dark mb-1">
                Sua Escola
              </h2>
              <p className="text-body-md text-fg-on-dark-muted mb-6">
                Identidade da sua escola no painel de tracking.
              </p>

              <div className="flex flex-col gap-4">
                <Field
                  id={`${uid}-nome`}
                  label="Nome da escola"
                  type="text"
                  required
                  placeholder="Ex: Cursinho Exemplo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, nome: true }))}
                  error={nomeError}
                />

                <Field
                  id={`${uid}-slug`}
                  label="Slug (identificador URL)"
                  type="text"
                  required
                  placeholder="cursinho-exemplo"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  onBlur={blurSlug}
                  error={slugError}
                  hint={!slugError ? `URL: tracking.escola.click/${slug || '...'}` : undefined}
                  suffix={
                    slug && !slugError ? (
                      <CheckCircle size={14} className="text-brand-green" aria-label="Slug disponivel" />
                    ) : slug && slugError ? (
                      <WarningCircle size={14} className="text-red-400" aria-label="Slug indisponivel" />
                    ) : null
                  }
                />

                <Field
                  id={`${uid}-url`}
                  label="URL do site (opcional)"
                  type="url"
                  placeholder="https://cursinho.com.br"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />

                {/* Upload de logo */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-body-sm font-medium text-fg-on-dark-muted">
                    Logo (opcional)
                  </label>
                  <div className="flex items-center gap-3">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Preview do logo"
                        className="h-12 w-12 rounded-lg object-cover border border-white/10"
                      />
                    ) : (
                      <div
                        className="h-12 w-12 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-fg-on-dark-subtle text-caption"
                        aria-hidden="true"
                      >
                        Logo
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="text-body-sm text-brand-green hover:text-brand-green/80 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
                    >
                      {logoFile ? 'Trocar imagem' : 'Enviar logo'}
                    </button>
                    {logoFile && (
                      <span className="text-caption text-fg-on-dark-subtle truncate max-w-[120px]">
                        {logoFile.name}
                      </span>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      id={`${uid}-logo`}
                      accept="image/*"
                      aria-label="Upload de logo"
                      className="sr-only"
                      onChange={handleLogoChange}
                    />
                  </div>
                </div>

                {/* Cor preset */}
                <div className="flex flex-col gap-2">
                  <span className="text-body-sm font-medium text-fg-on-dark-muted">
                    Cor do painel
                  </span>
                  <div className="flex gap-3" role="radiogroup" aria-label="Escolha a cor do painel">
                    {COLOR_PRESETS.map((c, i) => (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={colorIdx === i}
                        aria-label={c.label}
                        onClick={() => setColorIdx(i)}
                        className={`h-8 w-8 rounded-full ${c.bg} transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                          colorIdx === i ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-transparent scale-110' : 'hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {currentStep > 1 && (
            <div>
              <h2 className="text-h2 font-semibold text-fg-on-dark mb-2">
                {STEPS[currentStep - 1].label}
              </h2>
              <p className="text-body-md text-fg-on-dark-muted mb-8">
                {currentStep === 2 && 'Instale o GTM Web no seu site.'}
                {currentStep === 3 && 'Configure suas fontes de conversao (Hotmart, formularios, Chatwoot).'}
                {currentStep === 4 && 'Conecte suas contas de anuncios (Meta, Pinterest, Google Ads...).'}
                {currentStep === 5 && 'Tudo pronto! Acesse seu dashboard de tracking.'}
              </p>
              <div className="rounded-lg border border-dashed border-white/10 p-8 text-center">
                <p className="text-body-sm text-fg-on-dark-subtle">
                  Em construcao &mdash; Script de Tracking &mdash; Sprint 2
                </p>
                {currentStep === 2 && (
                  <pre className="mt-4 p-4 rounded-lg bg-black/40 text-brand-green text-body-sm text-left overflow-x-auto">
                    {'<!-- Adicione no <head> do seu site -->\n<script>/* GTM snippet sera gerado aqui */</script>'}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="text-fg-on-dark-muted"
          >
            Voltar
          </Button>
          <Button onClick={nextStep} loading={saving}>
            {isLast ? 'Ir para o Dashboard' : 'Proximo →'}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
