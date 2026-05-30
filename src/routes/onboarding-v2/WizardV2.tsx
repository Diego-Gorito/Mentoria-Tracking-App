/**
 * WizardV2 — onboarding "install-first" de 4 steps.
 *
 * Refactor (2026-05-29): substitui o wizard de 5 steps "school profile"
 * (`src/routes/onboarding/Wizard.tsx`, ainda acessível em /onboarding) por
 * um fluxo que leva o user da signup até plugin instalado.
 *
 * State machine:
 *   1 welcome  → 2 gtm        → 3 hosting → 4 install → done (dashboard)
 *                                     ↓ skip
 *                                  done com aviso "conecte depois"
 *
 * Recovery on reload (useOnboardingV2):
 *  - State persistido em localStorage por user_id + tenant_id.
 *  - Se installation_id + status `uploaded_pending_activation`, retoma
 *    direto no Step 4 wp-admin link.
 *
 * @see docs/stories (TODO F-S26)
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useOnboardingV2, type OnboardingV2Step } from '@/hooks/useOnboardingV2';
import { Step1Welcome } from './steps/Step1Welcome';
import { Step2ProvisionGtm } from './steps/Step2ProvisionGtm';
import { Step3ConnectHosting } from './steps/Step3ConnectHosting';
import { Step4InstallPlugin } from './steps/Step4InstallPlugin';
import { useSites } from '@/hooks/useSites';
import { useHostingerAccount } from '@/hooks/useHostingerAccount';

interface Props {
  /** Disparado quando user completa o wizard (cai no dashboard). */
  onComplete: () => void;
  /** Navegação geral pra App.tsx (sites, integracoes, etc). */
  onNavigate?: (href: string) => void;
}

const STEPS_META: Array<{ id: OnboardingV2Step; label: string; short: string }> = [
  { id: 1, label: 'Boas-vindas', short: 'Início' },
  { id: 2, label: 'Provisionar GTM', short: 'GTM' },
  { id: 3, label: 'Conectar Hostinger', short: 'Hostinger' },
  { id: 4, label: 'Instalar plugin', short: 'Plugin' },
];

export function WizardV2({ onComplete, onNavigate }: Props) {
  const confirm = useConfirm();
  const { state, goNext, goBack, goToStep, patch, complete, reset, ready } = useOnboardingV2();
  const stepContentRef = useRef<HTMLDivElement | null>(null);

  // Estado "skip hosting" → mostra final state direto na tela 3+ com aviso.
  const [skippedFinal, setSkippedFinal] = useState(false);

  // Recovery: se já tem installation rolando, pula pro Step 4.
  // useSites é mais cara que useInstallation direto, mas reusa cache do hook.
  const { sites } = useSites();
  const { account } = useHostingerAccount();

  // Auto-detect retomada em Step 4 (recovery on reload).
  useEffect(() => {
    if (!ready || state.completed_at || skippedFinal) return;
    // Se o user tem account + tem sites com installation em estado
    // pending_activation/draft, automaticamente pula pro Step 4 com aquela
    // installation_id (mas só se ainda não tem installation_id no state).
    if (!state.installation_id && account?.id && sites.length > 0) {
      const inflight = sites.find(
        (s) =>
          s.installation_id &&
          (s.status === 'uploaded_pending_activation' ||
            s.status === 'draft'),
      );
      if (inflight && inflight.installation_id) {
        patch({
          step: 4,
          hosting_account_id: account.id,
          selected_site_domain: inflight.domain,
          installation_id: inflight.installation_id,
        });
      }
    }
  }, [ready, state.completed_at, state.installation_id, account?.id, sites, skippedFinal, patch]);

  // Focus management — move foco pro H2 ao mudar step.
  useEffect(() => {
    const t = setTimeout(() => {
      const h2 = stepContentRef.current?.querySelector('h2') as HTMLElement | null;
      if (h2) {
        h2.setAttribute('tabindex', '-1');
        h2.focus();
      }
    }, 100);
    return () => clearTimeout(t);
  }, [state.step, skippedFinal]);

  // beforeunload guard (a partir do step 2)
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    if (state.step > 1 && !state.completed_at && !skippedFinal) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.step, state.completed_at, skippedFinal]);

  async function handleExit() {
    const ok = await confirm({
      title: 'Sair do setup?',
      message:
        'Seu progresso foi salvo localmente — quando voltar, retomamos de onde parou.',
      confirmLabel: 'Sair mesmo assim',
      cancelLabel: 'Continuar',
    });
    if (ok) {
      onNavigate?.('dashboard');
    }
  }

  function handleGoLegacy() {
    onNavigate?.('onboarding');
  }

  // Skip Hosting: mostramos final state custom + permite ir pro dashboard.
  // User pode voltar e completar depois via /sites/connect.
  function handleSkipHosting() {
    setSkippedFinal(true);
    patch({ skipped_hosting: true });
  }

  function handleFinalComplete() {
    complete();
    onComplete();
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-green border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--app-bg)' }}
    >
      {/* Header minimal */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
            <button
              type="button"
              onClick={reset}
              className="text-caption text-fg-on-dark-subtle hover:text-fg-on-dark transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              title="Reset state (dev only)"
            >
              dev: reset
            </button>
          )}
          <button
            type="button"
            onClick={handleExit}
            className="text-body-sm text-fg-on-dark-muted hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-body-sm text-fg-on-dark-muted">
                {skippedFinal ? 'Quase lá' : `Etapa ${state.step} de ${STEPS_META.length}`}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={skippedFinal ? STEPS_META.length : state.step}
              aria-valuemin={1}
              aria-valuemax={STEPS_META.length}
              aria-label="Progresso do setup"
              className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-brand-green transition-all duration-slow"
                style={{
                  width: `${((skippedFinal ? STEPS_META.length : state.step) / STEPS_META.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Steps nav */}
          {!skippedFinal && (
            <nav
              aria-label="Etapas do setup"
              className="flex gap-2 mb-8 overflow-x-auto pb-2"
            >
              {STEPS_META.map((s) => {
                const isActive = s.id === state.step;
                const isDone = s.id < state.step;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`Etapa ${s.id}: ${s.label}`}
                    disabled={s.id > state.step}
                    onClick={() => {
                      if (s.id < state.step) goToStep(s.id);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm whitespace-nowrap shrink-0 transition-colors ${
                      isActive
                        ? 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                        : isDone
                          ? 'text-fg-on-dark-muted hover:text-fg-on-dark cursor-pointer'
                          : 'text-fg-on-dark-subtle cursor-not-allowed opacity-60'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle
                        size={14}
                        weight="fill"
                        className="text-brand-green shrink-0"
                        aria-hidden="true"
                      />
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
                  </button>
                );
              })}
            </nav>
          )}

          {/* Step content */}
          <div
            ref={stepContentRef}
            className="rounded-xl border p-8 mb-6"
            style={{
              background: 'var(--app-card-bg)',
              borderColor: 'var(--app-card-border)',
            }}
          >
            {/* Skip path final state */}
            {skippedFinal && (
              <SkippedHostingFinalState
                onGoToDashboard={handleFinalComplete}
                onConnectNow={() => {
                  setSkippedFinal(false);
                  patch({ skipped_hosting: false });
                  goToStep(3);
                }}
              />
            )}

            {!skippedFinal && state.step === 1 && (
              <Step1Welcome onContinue={goNext} onGoToLegacy={handleGoLegacy} />
            )}

            {!skippedFinal && state.step === 2 && (
              <Step2ProvisionGtm
                pixelIds={state.pixel_ids}
                onChangePixelIds={(next) => patch({ pixel_ids: next })}
                onComplete={goNext}
                onBack={goBack}
              />
            )}

            {!skippedFinal && state.step === 3 && (
              <Step3ConnectHosting
                initialAccountId={state.hosting_account_id}
                initialSiteDomain={state.selected_site_domain}
                onComplete={({ hostingAccountId, site }) => {
                  patch({
                    hosting_account_id: hostingAccountId,
                    selected_site_domain: site.domain,
                  });
                  goNext();
                }}
                onSkip={handleSkipHosting}
                onBack={goBack}
              />
            )}

            {!skippedFinal && state.step === 4 && state.hosting_account_id && state.selected_site_domain && (
              <Step4InstallPlugin
                key={`${state.hosting_account_id}-${state.selected_site_domain}`}
                hostingAccountId={state.hosting_account_id}
                site={
                  // Constrói EnrichedSite minimal a partir do state — sites
                  // detalhados vêm de useSites internamente.
                  sites.find((s) => s.domain === state.selected_site_domain) ?? {
                    domain: state.selected_site_domain,
                    is_wordpress: true,
                  }
                }
                onComplete={handleFinalComplete}
                onBack={goBack}
                onViewSite={(site) => {
                  complete();
                  onNavigate?.(`sites/${encodeURIComponent(site.installation_id ?? site.domain)}`);
                }}
              />
            )}

            {!skippedFinal && state.step === 4 && (!state.hosting_account_id || !state.selected_site_domain) && (
              <MissingHostingState onGoBack={() => goToStep(3)} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SkippedHostingFinalState({
  onGoToDashboard,
  onConnectNow,
}: {
  onGoToDashboard: () => void;
  onConnectNow: () => void;
}) {
  return (
    <section className="flex flex-col gap-5 items-center text-center">
      <div className="h-14 w-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
        <CheckCircle size={28} weight="duotone" className="text-amber-400" aria-hidden="true" />
      </div>
      <h2 className="text-h2 font-semibold text-fg-on-dark" tabIndex={-1}>
        Container GTM provisionado!
      </h2>
      <p className="text-body-md text-fg-on-dark-muted max-w-md">
        Você optou por conectar a Hostinger depois. Tudo certo — quando estiver
        pronto, vá em <span className="font-mono">Sites → Conectar conta</span>{' '}
        pra instalar o plugin no seu WordPress.
      </p>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 max-w-md w-full text-left">
        <p className="text-body-sm font-medium text-fg-on-dark mb-2">
          Próximos passos quando voltar:
        </p>
        <ol className="text-body-sm text-fg-on-dark-muted list-decimal pl-5 flex flex-col gap-1">
          <li>Conectar conta Hostinger via token API</li>
          <li>Escolher o site WordPress</li>
          <li>Plugin instalado em ~30 segundos</li>
        </ol>
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-center pt-2">
        <Button variant="ghost" type="button" onClick={onConnectNow}>
          Conectar agora
        </Button>
        <Button type="button" size="lg" onClick={onGoToDashboard} data-autofocus>
          Ir pro dashboard →
        </Button>
      </div>
    </section>
  );
}

function MissingHostingState({ onGoBack }: { onGoBack: () => void }) {
  return (
    <section className="flex flex-col gap-4 items-center text-center">
      <h2 className="text-h2 font-semibold text-fg-on-dark" tabIndex={-1}>
        Faltando dados pra instalar
      </h2>
      <p className="text-body-md text-fg-on-dark-muted">
        Precisamos da conta Hostinger conectada + um site escolhido pra rodar o
        install. Vamos voltar pro Passo 3.
      </p>
      <Button type="button" onClick={onGoBack}>
        Voltar ao Passo 3
      </Button>
    </section>
  );
}
