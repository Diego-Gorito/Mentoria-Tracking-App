// SitesListPageContainer.tsx — Codex adversarial review #4 fix (2026-05-27)
//
// Wrapper que conecta `SitesListPage` (composição pura) ao install flow real:
// `useInstallTracking` (cria + dispara deploy + assina SSE), `useSites`,
// `useHostingerAccount`. ANTES disso, `App.tsx` renderizava SitesListPage sem
// `onInstallSite`, então o botão "Instalar tracking" ficava escondido — install
// flow inteiro era dead code.
//
// Responsabilidades:
//  1. Renderizar SitesListPage com callbacks reais (`onInstallSite`,
//     `onRevalidateSite`).
//  2. Quando user clica install: mountar `InstallFlow` overlay que mostra
//     `InstallProgressModal` durante o upload e transita pra success/failure/
//     pending_activation no terminal step.
//  3. Quando user clica "Já ativei, validar agora" no card pending_activation:
//     fetch POST /api/installations/:id/revalidate + refresh sites.
//
// State machine do install flow:
//   idle → installing → (pending_activation | installed | failed) → idle
//
// `pending_activation` é o estado terminal happy path do MVP (Codex #4): plugin
// foi subido, user precisa ativar no wp-admin → clica "Já ativei, validar agora"
// que dispara /revalidate (validator F-S06) → installed.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SitesListPage } from './SitesListPage'
import { InstallProgressModal, DEFAULT_INSTALL_STEPS } from '@/components/sites/InstallProgressModal'
import { InstallSuccessState } from '@/components/sites/InstallSuccessState'
import { InstallFailureState } from '@/components/sites/InstallFailureState'
import { useInstallTracking, type ProgressState } from '@/hooks/useInstallTracking'
import { useSites } from '@/hooks/useSites'
import { useHostingerAccount } from '@/hooks/useHostingerAccount'
import { useToast } from '@/components/ui/Toast'
import { apiFetch } from '@/lib/sitesApi'
import { translateApiError } from '@/lib/translateApiError'
import type { BrandSlug, EnrichedSite, InstallStep } from '@/types/sites'
import { Clock } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'

type Props = {
  onNavigate?: (href: string) => void
  /** Disparado quando user clica "Ver detalhes" — App.tsx remonta SiteDetailPage. */
  onViewSiteDetails?: (site: EnrichedSite) => void
}

/**
 * Mapa de step do SSE → 4 steps fixos da UX §3 Tela 5:
 *   0: Conectando com Hostinger
 *   1: Instalando plugin GTM4WP
 *   2: Validando dataLayer (não usado no fluxo pending_activation; pulado)
 *   3: Registrando audit log
 *
 * Codex #4: `pending_activation` terminal => step 1 done, 2-3 não rolam até
 * revalidate. UI fecha modal nesse ponto e mostra estado pending.
 */
function mapProgressToSteps(progress: ProgressState): {
  steps: InstallStep[]
  currentStep: number
} {
  const steps: InstallStep[] = DEFAULT_INSTALL_STEPS.map((s) => ({ ...s }))
  const step = progress.step

  // Etapa 0 — Conectando com Hostinger (creating_draft, deploying).
  // Etapa 1 — Instalando plugin (upload_started, uploading, upload_complete).
  // Etapa 2 — Validando (validation_*) — só roda no /revalidate.
  // Etapa 3 — Audit log (registrado backend; UI marca done junto com terminal).
  const PHASE_0 = new Set(['idle', 'creating_draft', 'deploying'])
  const PHASE_1 = new Set(['upload_started', 'uploading'])
  const PHASE_1_DONE = new Set(['upload_complete', 'activating', 'activation_started'])

  if (PHASE_0.has(step)) {
    steps[0].status = 'in_progress'
    return { steps, currentStep: 0 }
  }

  if (PHASE_1.has(step)) {
    steps[0].status = 'done'
    steps[1].status = 'in_progress'
    return { steps, currentStep: 1 }
  }

  if (PHASE_1_DONE.has(step)) {
    steps[0].status = 'done'
    steps[1].status = 'done'
    if (typeof progress.timing_ms === 'number') steps[1].durationMs = progress.timing_ms
    steps[2].status = 'in_progress'
    return { steps, currentStep: 2 }
  }

  if (step === 'pending_activation') {
    // Terminal MVP — fecha modal (container troca pra InstallPendingActivation state).
    steps[0].status = 'done'
    steps[1].status = 'done'
    if (typeof progress.timing_ms === 'number') steps[1].durationMs = progress.timing_ms
    steps[2].status = 'pending'
    steps[3].status = 'pending'
    return { steps, currentStep: 1 }
  }

  if (step === 'validation_started' || step === 'validating') {
    steps[0].status = 'done'
    steps[1].status = 'done'
    steps[2].status = 'in_progress'
    return { steps, currentStep: 2 }
  }

  if (step === 'validation_passed' || step === 'installed' || step === 'validated') {
    steps[0].status = 'done'
    steps[1].status = 'done'
    steps[2].status = 'done'
    steps[3].status = 'done'
    return { steps, currentStep: 3 }
  }

  if (step === 'validation_failed' || step === 'failed' || step === 'upload_failed') {
    steps[0].status = 'done'
    // Identifica qual etapa quebrou pelo nome.
    if (step === 'upload_failed') {
      steps[1].status = 'failed'
      return { steps, currentStep: 1 }
    }
    steps[1].status = 'done'
    steps[2].status = 'failed'
    return { steps, currentStep: 2 }
  }

  // Fallback defensivo — passa todos como pending.
  return { steps, currentStep: 0 }
}

interface InstallFlowProps {
  site: EnrichedSite
  brand: BrandSlug
  hostingAccountId: string
  onClose: () => void
}

/**
 * Componente interno que monta `useInstallTracking` e renderiza modal/state
 * baseado no progresso. Isolated num componente próprio pra hook resetar
 * via `key` quando user instalar outro site.
 */
function InstallFlow({ site, brand, hostingAccountId, onClose }: InstallFlowProps) {
  // siteId pro hook reset cross-install — domain é único o suficiente.
  const tracker = useInstallTracking(site.domain)
  const [startError, setStartError] = useState<Error | null>(null)
  const [revalidating, setRevalidating] = useState(false)
  const { toast } = useToast()

  // Mount: dispara start. Ignora dupla-execução (StrictMode).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await tracker.start(brand, {
          hostingAccountId,
          siteDomain: site.domain,
        })
      } catch (err) {
        if (cancelled) return
        setStartError(err instanceof Error ? err : new Error(String(err)))
      }
    })()
    return () => {
      cancelled = true
    }
    // start é stable callback; rodar APENAS no mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { steps, currentStep } = useMemo(
    () => mapProgressToSteps(tracker.progress),
    [tracker.progress],
  )

  // Handler revalidate pós-ativação manual no wp-admin.
  const handleRevalidate = useCallback(async () => {
    if (!tracker.install) return
    setRevalidating(true)
    try {
      await apiFetch(`/api/installations/${tracker.install.id}/revalidate`, {
        method: 'POST',
      })
      toast('Validação completa — tracking instalado.', 'success')
      onClose()
    } catch (err) {
      const translated = translateApiError(err)
      toast(translated.message, 'error')
    } finally {
      setRevalidating(false)
    }
  }, [tracker.install, toast, onClose])

  // Start error: mostra failure state.
  if (startError) {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-border-default overflow-hidden">
          <InstallFailureState
            domain={site.domain}
            errorCode="CREATE_FAILED"
            errorMessage={startError.message}
            errorId={tracker.install?.id ?? 'pre-create'}
            suggestions={[
              'Verifique se sua conta Hostinger ainda está ativa.',
              'Tente recarregar a página e instalar de novo.',
              'Se persistir, copie o ID do erro e contate suporte.',
            ]}
            onAction={(action) => {
              if (action === 'cancel' || action === 'retry') onClose()
            }}
          />
        </div>
      </div>
    )
  }

  // Terminal: pending_activation (happy path MVP).
  if (tracker.status === 'pending_activation') {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="pending-activation-title"
          className="w-full max-w-xl rounded-xl bg-white text-fg-on-light shadow-xl border border-border-default overflow-hidden p-7 flex flex-col gap-5 items-center text-center"
        >
          <div
            aria-hidden="true"
            className="h-20 w-20 rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center"
          >
            <Clock size={48} weight="duotone" className="text-warning-text" />
          </div>
          <h2 id="pending-activation-title" className="text-h2 font-semibold text-brand-black">
            Plugin enviado pro seu site
          </h2>
          <p className="text-body-md text-fg-on-light-muted">
            <span className="font-mono text-brand-black">{site.domain}</span> recebeu o plugin
            GTM4WP. Falta apenas você ativar no wp-admin pra finalizar.
          </p>
          <ol className="text-left text-body-sm text-fg-on-light list-decimal pl-5 self-stretch max-w-md mx-auto flex flex-col gap-1.5">
            <li>
              Abra <span className="font-mono">{site.domain}/wp-admin</span>
            </li>
            <li>
              Vá em <span className="font-medium">Plugins → Plugins Instalados</span>
            </li>
            <li>
              Localize <span className="font-mono">GTM4WP (Mentoria)</span> e clique em{' '}
              <span className="font-medium">Ativar</span>
            </li>
            <li>Volte aqui e clique no botão abaixo</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <Button
              variant="primary"
              size="md"
              onClick={() => void handleRevalidate()}
              loading={revalidating}
              disabled={revalidating}
              data-autofocus
              className="min-h-[44px]"
            >
              Já ativei, validar agora
            </Button>
            <Button variant="ghost" size="md" onClick={onClose} disabled={revalidating}>
              Fechar e validar depois
            </Button>
          </div>
        </section>
      </div>
    )
  }

  // Terminal: installed.
  if (tracker.status === 'installed') {
    const containerId = tracker.install?.gtm_container_id ?? site.container_id ?? '—'
    const durationSec = Math.round((tracker.progress.timing_ms ?? 0) / 1000)
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-border-default overflow-hidden">
          <InstallSuccessState
            domain={site.domain}
            containerId={containerId}
            brandSlug={brand}
            durationSec={durationSec}
            onAction={(action) => {
              if (action === 'open_site') {
                window.open(`https://${site.domain}`, '_blank', 'noopener,noreferrer')
              } else if (action === 'back_to_list' || action === 'install_another') {
                onClose()
              } else if (action === 'view_audit') {
                onClose()
                // Container's parent (App.tsx) decides nav baseado em onViewSiteDetails.
              }
            }}
          />
        </div>
      </div>
    )
  }

  // Terminal: failed.
  if (tracker.status === 'failed') {
    const failedStep = tracker.progress.step
    const errorCode = failedStep === 'upload_failed' ? 'UPLOAD_FAILED' : 'VALIDATION_FAILED'
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-border-default overflow-hidden">
          <InstallFailureState
            domain={site.domain}
            errorCode={errorCode}
            errorMessage={tracker.install?.last_error ?? 'Erro desconhecido durante a instalação.'}
            errorId={tracker.install?.id ?? 'unknown'}
            suggestions={
              errorCode === 'UPLOAD_FAILED'
                ? [
                    'Confirme que sua conta Hostinger consegue gerenciar esse site.',
                    'Verifique cota de disco / quota da hospedagem.',
                    'Tente reinstalar em alguns minutos (pode ser instabilidade transitória).',
                  ]
                : [
                    'Confirme que o plugin GTM4WP está ativo em wp-admin → Plugins.',
                    'Limpe cache do WordPress se houver plugin de cache.',
                    'Verifique se o container ID está correto na config do plugin.',
                  ]
            }
            onAction={(action) => {
              if (action === 'cancel') onClose()
              else if (action === 'retry') {
                // Retry = re-mount InstallFlow com nova key (handled pelo container).
                onClose()
              }
            }}
          />
        </div>
      </div>
    )
  }

  // Em andamento — modal progress.
  return (
    <InstallProgressModal
      isOpen
      steps={steps}
      currentStep={currentStep}
      domain={site.domain}
      estimatedSeconds={45}
    />
  )
}

export function SitesListPageContainer({ onNavigate, onViewSiteDetails }: Props) {
  const [installing, setInstalling] = useState<{ site: EnrichedSite; brand: BrandSlug } | null>(
    null,
  )
  const [revalidatingSiteId, setRevalidatingSiteId] = useState<string | null>(null)
  const { account } = useHostingerAccount()
  const { refresh: refreshSites } = useSites()
  const { toast } = useToast()

  const handleInstall = useCallback(
    (site: EnrichedSite, brand: BrandSlug) => {
      if (!account?.id) {
        toast('Conecte sua conta Hostinger primeiro.', 'error')
        onNavigate?.('sites/connect')
        return
      }
      setInstalling({ site, brand })
    },
    [account?.id, onNavigate, toast],
  )

  const handleRevalidate = useCallback(
    async (site: EnrichedSite) => {
      if (!site.installation_id) {
        toast('Esse site ainda não foi instalado.', 'error')
        return
      }
      setRevalidatingSiteId(site.domain)
      try {
        await apiFetch(`/api/installations/${site.installation_id}/revalidate`, {
          method: 'POST',
        })
        toast('Validação completa — tracking instalado.', 'success')
        await refreshSites()
      } catch (err) {
        const translated = translateApiError(err)
        toast(translated.message, 'error')
      } finally {
        setRevalidatingSiteId(null)
      }
    },
    [toast, refreshSites],
  )

  const handleClose = useCallback(() => {
    setInstalling(null)
    void refreshSites()
  }, [refreshSites])

  // siteId param p/ useInstallTracking (não-usado direto pelo container, só
  // pra `key` reset quando user instala em site diferente — ver render abaixo).
  void revalidatingSiteId

  return (
    <>
      <SitesListPage
        onNavigate={onNavigate}
        onViewSiteDetails={onViewSiteDetails}
        onInstallSite={handleInstall}
        onRevalidateSite={handleRevalidate}
      />
      {installing && account?.id && (
        <InstallFlow
          key={installing.site.domain}
          site={installing.site}
          brand={installing.brand}
          hostingAccountId={account.id}
          onClose={handleClose}
        />
      )}
    </>
  )
}
