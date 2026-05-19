// Wizard.tsx — Onboarding de 5 steps com state machine + autosave + load on mount
// Sem AppShell — header minimal próprio (spec Uma §2).
// Progress bar: role=progressbar. Steps nav: role=tablist/tab.
// Focus move pra h2 de cada step ao avançar (via useEffect + stepRef).
// beforeunload → ConfirmDialog de saída.

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useOnboarding } from '@/hooks/useOnboarding'
import { Step1Brand, type Step1Data } from './steps/Step1Brand'
import { Step2Tracking } from './steps/Step2Tracking'
import { Step3Sources, type Step3Data } from './steps/Step3Sources'
import { Step4Ads } from './steps/Step4Ads'
import { Step5Done } from './steps/Step5Done'
import type { PlatformId } from '@/routes/settings/platforms'

const STEPS = [
  { id: 1, label: 'Sua Escola', short: 'Brand' },
  { id: 2, label: 'Script de Tracking', short: 'Tracking' },
  { id: 3, label: 'Conversões', short: 'Conversões' },
  { id: 4, label: 'Contas de Anúncios', short: 'Ads' },
  { id: 5, label: 'Pronto!', short: 'Done' },
]

type Props = {
  onComplete?: () => void
  onNavigate?: (href: string) => void
}

export function Wizard({ onNavigate }: Props) {
  function navigate(href: string) { onNavigate?.(href) }
  const { toast } = useToast()
  const confirm = useConfirm()
  const { state: serverState, loading, saving, slugCheck, actions } = useOnboarding()

  // Step atual — sincroniza com server state ao montar
  const [currentStep, setCurrentStep] = useState(1)
  const [hasResumed, setHasResumed] = useState(false)

  // Step 1
  const [step1Data, setStep1Data] = useState<Step1Data>({
    name: localStorage.getItem('mentoria-tracking.signup-company') ?? '',
    slug: localStorage.getItem('mentoria-tracking.signup-slug') ?? '',
    url: '',
    logoUrl: null,
    brandColor: '#16DF6F',
  })
  const [step1Touched, setStep1Touched] = useState<Record<string, boolean>>({})
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  // Step 2
  const [trackingVerified, setTrackingVerified] = useState(false)

  // Step 3
  const [step3Data, setStep3Data] = useState<Step3Data>({ sources: [] })
  const [step3ShowAlert, setStep3ShowAlert] = useState(false)
  const [skippedSources, setSkippedSources] = useState(false)

  // Step 4
  const [configuredPlatforms, setConfiguredPlatforms] = useState<PlatformId[]>([])

  // Focus management — move foco para o h2 do step ao avançar
  const stepContentRef = useRef<HTMLDivElement | null>(null)

  // Ao carregar server state, sincronizar step + dados
  useEffect(() => {
    if (!serverState || hasResumed) return
    const step = serverState.onboarding_step ?? 1
    if (step > 1) {
      setCurrentStep(step)
      toast(`Retomando de onde você parou — Etapa ${step}`, 'info')
      setHasResumed(true)
    }
    if (serverState.name) {
      setStep1Data((d) => ({
        ...d,
        name: serverState.name,
        slug: serverState.slug,
      }))
    }
  }, [serverState, hasResumed, toast])

  // Redirect se onboarding já completo
  useEffect(() => {
    if (serverState?.completed_at) {
      navigate('/dashboard')
    }
  }, [serverState, navigate])

  // Focar h2 ao mudar step
  useEffect(() => {
    const h2 = stepContentRef.current?.querySelector('h2') as HTMLElement | null
    if (h2) {
      h2.setAttribute('tabindex', '-1')
      h2.focus()
    }
  }, [currentStep])

  // beforeunload guard
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    if (currentStep > 1) {
      window.addEventListener('beforeunload', handleBeforeUnload)
    }
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentStep])

  function handleStep1Blur(field: string) {
    setStep1Touched((t) => ({ ...t, [field]: true }))
  }

  async function handleLogoUpload(file: File): Promise<string | null> {
    setLogoUploadError(null)
    setLogoUploading(true)
    // Passa slug atual (ou slug do server) para cache localStorage (B4 fix)
    const slug = step1Data.slug || serverState?.slug || 'unknown'
    const url = await actions.uploadLogo(file, slug)
    setLogoUploading(false)
    if (!url) {
      setLogoUploadError('Falha ao enviar. Tente de novo.')
    } else {
      toast('Logo salvo localmente', 'success')
    }
    return url
  }

  const handleSlugChange = useCallback(actions.checkSlug, [actions.checkSlug])

  // Validação e save por step
  async function handleNext() {
    if (currentStep === 1) {
      setStep1Touched({ name: true, slug: true })
      if (!step1Data.name.trim()) return
      if (!step1Data.slug || step1Data.slug.length < 3) return
      if (slugCheck.status === 'unavailable') return

      // B3 fix: criar tenant antes de salvar dados do step, apenas se ainda não existe
      if (serverState === null) {
        const tenantCreated = await actions.createTenant({
          slug: step1Data.slug,
          name: step1Data.name,
        })
        if (!tenantCreated) return
      }

      const ok = await actions.saveStep1({
        name: step1Data.name,
        slug: step1Data.slug,
        url: step1Data.url || undefined,
        logo_url: step1Data.logoUrl ?? undefined,
        brand_color: step1Data.brandColor,
      })
      if (!ok) return
      toast('Etapa 1 salva!', 'success')
      setCurrentStep(2)
    } else if (currentStep === 2) {
      const ok = await actions.saveStep2(trackingVerified)
      if (!ok) return
      toast('Etapa 2 salva!', 'success')
      setCurrentStep(3)
    } else if (currentStep === 3) {
      if (!skippedSources && step3Data.sources.length === 0) {
        setStep3ShowAlert(true)
        return
      }
      const ok = await actions.saveStep3(step3Data.sources, step3Data.formPlatform)
      if (!ok) return
      toast('Etapa 3 salva!', 'success')
      setCurrentStep(4)
    } else if (currentStep === 4) {
      const ok = await actions.saveStep4(configuredPlatforms.map((p) => p as string))
      if (!ok) return
      toast('Etapa 4 salva!', 'success')
      setCurrentStep(5)
    }
  }

  function handlePrev() {
    if (currentStep > 1) setCurrentStep((s) => s - 1)
  }

  async function handleExitWizard() {
    const ok = await confirm({
      title: 'Sair do setup?',
      message: 'Seu progresso até aqui foi salvo. Retome quando quiser em Configurações → Setup inicial.',
      confirmLabel: 'Sair mesmo assim',
      cancelLabel: 'Continuar configurando',
    })
    if (ok) navigate('/dashboard')
  }

  async function handleSaveAndLeave() {
    // Salva progresso atual e redireciona
    await handleExitWizard()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-green border-t-transparent" />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--app-bg)' }}
    >
      {/* Header minimal */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <Logo size="sm" />
        <button
          type="button"
          onClick={handleExitWizard}
          className="text-body-sm text-fg-on-dark-muted hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
        >
          Sair do wizard
        </button>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto">

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-body-sm text-fg-on-dark-muted">
                Etapa {currentStep} de {STEPS.length}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={currentStep}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-label="Progresso do setup"
              className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-brand-green transition-all duration-slow"
                style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Steps nav */}
          <div
            role="tablist"
            aria-label="Etapas do onboarding"
            className="flex gap-2 mb-8 overflow-x-auto pb-2"
          >
            {STEPS.map((s) => {
              // B5 fix: determinar isDone por onboarding_data, não apenas por currentStep
              const od = serverState?.onboarding_data
              const stepDoneMap: Record<number, boolean> = {
                1: Boolean(od?.brand) || Boolean(od?.name),
                2: od?.tracking_verified === true,
                3: (Array.isArray(od?.sources) && (od.sources as string[]).length > 0)
                  || od?.skipped_sources === true,
                4: Array.isArray(od?.platforms_configured),
                5: Boolean(serverState?.completed_at),
              }
              // B5 fix: step é "done-skip" quando foi completado via pular (sem dados reais)
              const stepSkippedMap: Record<number, boolean> = {
                3: od?.skipped_sources === true && !(Array.isArray(od?.sources) && (od.sources as string[]).length > 0),
                4: Array.isArray(od?.platforms_configured) && (od.platforms_configured as string[]).length === 0,
              }
              const isDone = stepDoneMap[s.id] ?? false
              const isSkipped = stepSkippedMap[s.id] ?? false
              const isActive = s.id === currentStep
              const isFuture = !isDone && s.id > currentStep
              return (
                <div
                  key={s.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-disabled={isFuture}
                  aria-label={`Etapa ${s.id}: ${s.label}`}
                  tabIndex={-1}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                      : isDone
                        ? 'text-fg-on-dark-muted'
                        : 'text-fg-on-dark-subtle'
                  }`}
                >
                  {isDone && !isSkipped ? (
                    // Done com dados reais: CheckCircle verde fill
                    <CheckCircle size={14} weight="fill" className="text-brand-green shrink-0" aria-hidden="true" />
                  ) : isDone && isSkipped ? (
                    // Skipped/pulado: CheckCircle outline cinza (completou mas pulou)
                    <CheckCircle size={14} weight="regular" className="text-fg-on-dark-subtle shrink-0" aria-hidden="true" />
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
            ref={stepContentRef}
            className="rounded-xl border p-8 mb-6"
            style={{
              background: 'var(--app-card-bg)',
              borderColor: 'var(--app-card-border)',
            }}
          >
            {currentStep === 1 && (
              <Step1Brand
                initial={step1Data}
                slugCheck={slugCheck}
                onSlugChange={handleSlugChange}
                onSlugBlur={actions.checkSlug}
                onLogoUpload={handleLogoUpload}
                onChange={setStep1Data}
                touched={step1Touched}
                onBlur={handleStep1Blur}
                uploadError={logoUploadError}
                uploadLoading={logoUploading}
              />
            )}

            {currentStep === 2 && (
              <Step2Tracking
                onVerified={(v) => {
                  setTrackingVerified(v)
                  if (v) {
                    // auto-advance not done here — user clicks CTA
                  }
                }}
              />
            )}

            {currentStep === 3 && (
              <Step3Sources
                initial={step3Data}
                showAlert={step3ShowAlert}
                onChange={(d) => {
                  setStep3Data(d)
                  setStep3ShowAlert(false)
                }}
              />
            )}

            {currentStep === 4 && (
              <Step4Ads
                sources={step3Data.sources}
                configuredPlatforms={configuredPlatforms}
                onConfigured={setConfiguredPlatforms}
                onSkipAll={async () => {
                  const ok = await actions.saveStep4([])
                  if (ok) {
                    toast('Etapa 4 salva!', 'success')
                    setCurrentStep(5)
                  }
                }}
              />
            )}

            {currentStep === 5 && (
              <Step5Done
                name={step1Data.name || serverState?.name || ''}
                slug={step1Data.slug || serverState?.slug || ''}
                trackingVerified={trackingVerified}
                sources={step3Data.sources}
                configuredPlatforms={configuredPlatforms}
                saving={saving}
                onComplete={actions.complete}
              />
            )}
          </div>

          {/* Footer de ações — não aparece no step 5 (tem CTA próprio) */}
          {currentStep < 5 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={handlePrev}
                disabled={currentStep === 1}
              >
                Voltar
              </Button>

              {currentStep >= 2 && (
                <button
                  type="button"
                  onClick={handleSaveAndLeave}
                  className="text-body-sm text-fg-on-dark-subtle hover:text-fg-on-dark-muted transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded"
                >
                  Salvar e terminar depois
                </button>
              )}

              {/* Botão "Pular" apenas no step 3 */}
              {currentStep === 3 && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setSkippedSources(true)
                    void actions.saveStep3([]).then((ok) => {
                      if (ok) setCurrentStep(4)
                    })
                  }}
                  disabled={saving}
                >
                  Ainda não sei — configurar depois
                </Button>
              )}

              <Button
                type="button"
                onClick={handleNext}
                loading={saving}
                disabled={saving}
              >
                {currentStep === 2 && !trackingVerified
                  ? 'Continuar mesmo assim'
                  : 'Salvar e continuar'}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
