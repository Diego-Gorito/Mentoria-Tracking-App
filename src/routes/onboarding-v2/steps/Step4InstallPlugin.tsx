/**
 * Step4InstallPlugin — instala plugin + ativação + validação.
 *
 * Fluxo automático ao montar:
 *  1. POST /api/installations (já feito por useInstallTracking.start())
 *  2. POST /api/installations/:id/deploy → assina SSE
 *  3. Progress bar até `uploaded_pending_activation`
 *  4. UI flip → instrução wp-admin + botão "Já ativei, validar agora"
 *  5. POST /api/installations/:id/revalidate → installed | failed
 *  6. Success screen com CTAs "Ver detalhes" + "Ir pro dashboard"
 *
 * Brand slug: se tenant.slug está em BRAND_GTM_MAP, usa direto. Caso
 * contrário, fallback `mentoria` (resolver Era 2 vai pegar container do
 * tenant via tenant_containers automaticamente — F-S23).
 */

import { useId, useEffect, useState, useMemo, useCallback } from 'react';
import {
  CheckCircle,
  WarningCircle,
  Plug,
  ArrowSquareOut,
  Clock,
  Spinner,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTenant } from '@/hooks/useTenant';
import { useInstallTracking, type ProgressState } from '@/hooks/useInstallTracking';
import { apiFetch } from '@/lib/sitesApi';
import { translateApiError } from '@/lib/translateApiError';
import type { BrandSlug, EnrichedSite } from '@/types/sites';
import { cn } from '@/lib/utils';

/**
 * BrandSlugs aceitos pelo backend (F-S05 AC-5). Re-declarado aqui pra evitar
 * import do workers/.
 */
const VALID_BRAND_SLUGS: BrandSlug[] = ['mentoria', 'mentoria-app', 'zerohum', 'ifrn'];

interface Props {
  hostingAccountId: string;
  site: EnrichedSite;
  onComplete: () => void;
  onBack: () => void;
  /** Disparado quando user clica "Ver detalhes" pós-success. */
  onViewSite?: (site: EnrichedSite) => void;
}

interface Phase {
  kind: 'starting' | 'uploading' | 'pending_activation' | 'validating' | 'installed' | 'failed';
}

/**
 * Resolve brand slug pro POST /api/installations.
 *
 * Lógica:
 *  - Se tenant slug é válido (mentoria/mentoria-app/zerohum/ifrn), usa direto.
 *  - Caso contrário, fallback `mentoria` (resolver Era 2 vai sobrescrever pelo
 *    container do próprio tenant via core.tenant_containers).
 *
 * Note: brand_slug é só pra fallback Era 1 (BRAND_GTM_MAP). Pra tenants Era 2
 * o backend ignora e pega o container real do tenant_containers.
 */
function resolveBrandSlug(tenantSlug: string | undefined): BrandSlug {
  if (tenantSlug && (VALID_BRAND_SLUGS as string[]).includes(tenantSlug)) {
    return tenantSlug as BrandSlug;
  }
  return 'mentoria';
}

export function Step4InstallPlugin({
  hostingAccountId,
  site,
  onComplete,
  onBack,
  onViewSite,
}: Props) {
  const uid = useId();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const tracker = useInstallTracking(site.domain);
  const [revalidating, setRevalidating] = useState(false);
  const [validationFailed, setValidationFailed] = useState<string | null>(null);
  const [startError, setStartError] = useState<Error | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const brandSlug = useMemo(() => resolveBrandSlug(tenant?.slug), [tenant?.slug]);

  // Mount: dispara install + deploy uma única vez.
  useEffect(() => {
    if (hasStarted) return;
    setHasStarted(true);
    void (async () => {
      try {
        await tracker.start(brandSlug, {
          hostingAccountId,
          siteDomain: site.domain,
        });
      } catch (err) {
        setStartError(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    // start é callback estável; rodar 1× no mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, brandSlug, hostingAccountId, site.domain]);

  const handleRevalidate = useCallback(async () => {
    if (!tracker.install) return;
    setRevalidating(true);
    setValidationFailed(null);
    try {
      const res = await apiFetch<{
        data: {
          passed: boolean;
          stage: string;
          details?: {
            containerMatch: boolean;
            expectedMatch: boolean;
            datalayerMatch: boolean;
            expectedContainerId: string;
          };
        };
      }>(`/api/installations/${tracker.install.id}/revalidate`, { method: 'POST' });

      if (res.data.passed) {
        toast('Tracking validado!', 'success');
        // Próximo useEffect detecta status `installed` via tracker e flip pra phase.
      } else {
        const reason =
          res.data.details && !res.data.details.containerMatch
            ? 'Container GTM não detectado no HTML.'
            : res.data.details && !res.data.details.datalayerMatch
              ? 'dataLayer não inicializado.'
              : 'Validação falhou.';
        setValidationFailed(reason);
      }
    } catch (err) {
      const translated = translateApiError(err);
      toast(translated.message, 'error');
      setValidationFailed(translated.message);
    } finally {
      setRevalidating(false);
    }
  }, [tracker.install, toast]);

  // Derive phase do tracker.status + tracker.progress.step
  const phase: Phase = useMemo(() => {
    if (startError) return { kind: 'failed' };
    if (tracker.status === 'failed') return { kind: 'failed' };
    if (tracker.status === 'installed') return { kind: 'installed' };
    if (tracker.status === 'pending_activation') return { kind: 'pending_activation' };
    if (tracker.status === 'installing') {
      // Diferenciar uploading vs validating no progress.step
      const step = tracker.progress.step;
      if (step === 'validation_started' || step === 'validating' || step === 'validation_passed') {
        return { kind: 'validating' };
      }
      return { kind: 'uploading' };
    }
    return { kind: 'starting' };
  }, [tracker.status, tracker.progress.step, startError]);

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Plug size={20} weight="duotone" className="text-brand-green" aria-hidden="true" />
          <span className="text-caption font-mono text-fg-on-dark-subtle uppercase tracking-wide">
            Passo 4 de 4
          </span>
        </div>
        <h2
          id={`${uid}-title`}
          className="text-h2 font-semibold text-fg-on-dark"
          tabIndex={-1}
        >
          Instalando no seu site
        </h2>
        <p className="text-body-md text-fg-on-dark-muted">
          Enviando plugin pro <span className="font-mono">{site.domain}</span>{' '}
          via TUS upload. Quando terminar, você ativa em 2 cliques no wp-admin.
        </p>
      </header>

      {(phase.kind === 'starting' || phase.kind === 'uploading') && (
        <UploadingState progress={tracker.progress} />
      )}

      {phase.kind === 'pending_activation' && (
        <PendingActivationState
          domain={site.domain}
          onRevalidate={handleRevalidate}
          revalidating={revalidating}
          validationFailed={validationFailed}
        />
      )}

      {phase.kind === 'validating' && <ValidatingState />}

      {phase.kind === 'installed' && (
        <InstalledState
          site={site}
          containerId={tracker.install?.gtm_container_id}
          onViewDetails={onViewSite ? () => onViewSite(site) : undefined}
          onGoToDashboard={onComplete}
        />
      )}

      {phase.kind === 'failed' && (
        <FailedState
          site={site}
          errorMessage={
            startError?.message ?? tracker.install?.last_error ?? 'Erro desconhecido durante a instalação.'
          }
          step={tracker.progress.step}
          onRetry={() => {
            // Re-mount via key/state — caller reset.
            setHasStarted(false);
            setStartError(null);
            setValidationFailed(null);
          }}
          onBack={onBack}
        />
      )}
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function UploadingState({ progress }: { progress: ProgressState }) {
  const stepLabel = useMemo(() => {
    if (progress.step === 'creating_draft') return 'Criando draft…';
    if (progress.step === 'deploying' || progress.step === 'upload_started') return 'Enviando arquivos via TUS…';
    if (progress.step === 'uploading') return 'Enviando arquivos do plugin…';
    if (progress.step === 'upload_complete') return 'Upload concluído. Próximo step…';
    if (progress.step === 'activating' || progress.step === 'activation_started') return 'Ativando plugin…';
    if (progress.step === 'idle') return 'Preparando…';
    return progress.step;
  }, [progress.step]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-brand-green/30 bg-brand-green/[0.04] p-6 flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <Spinner size={28} weight="bold" className="text-brand-green animate-spin shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-body-md font-medium text-fg-on-dark">{stepLabel}</p>
          <p className="text-body-sm text-fg-on-dark-muted">
            Estimativa: ~30 segundos no total.
          </p>
        </div>
      </div>

      {progress.timing_ms && (
        <p className="text-caption font-mono text-fg-on-dark-subtle tabular-nums">
          Última etapa: {Math.round(progress.timing_ms / 100) / 10}s
        </p>
      )}
    </div>
  );
}

function PendingActivationState({
  domain,
  onRevalidate,
  revalidating,
  validationFailed,
}: {
  domain: string;
  onRevalidate: () => void;
  revalidating: boolean;
  validationFailed: string | null;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Clock size={24} weight="duotone" className="text-amber-400" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <p className="text-body-lg font-medium text-fg-on-dark">
            Plugin enviado! Falta ativar.
          </p>
          <p className="text-body-sm text-fg-on-dark-muted mt-1">
            O plugin chegou em <span className="font-mono">{domain}</span>. Agora
            é só ativar no wp-admin.
          </p>
        </div>
      </div>

      <ol className="text-body-sm text-fg-on-dark list-decimal pl-5 flex flex-col gap-1.5">
        <li>
          Clique no link abaixo —{' '}
          <a
            href={`https://${domain}/wp-admin/plugins.php?s=mentoria`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-green hover:underline inline-flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded"
          >
            abrir wp-admin → Plugins
            <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
          </a>
        </li>
        <li>
          Localize <span className="font-mono">GTM4WP (Mentoria)</span> na lista
        </li>
        <li>Clique em <span className="font-medium">Ativar</span></li>
        <li>Volte aqui e clique no botão abaixo</li>
      </ol>

      {validationFailed && (
        <div
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/[0.06] p-3 text-body-sm text-fg-on-dark"
        >
          <p className="font-medium">Validação falhou.</p>
          <p className="text-body-sm text-fg-on-dark-muted">{validationFailed}</p>
          <p className="text-caption text-fg-on-dark-subtle mt-1">
            Confirme que o plugin foi mesmo ativado e clique de novo.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button
          type="button"
          size="lg"
          onClick={onRevalidate}
          loading={revalidating}
          disabled={revalidating}
          data-autofocus
        >
          {revalidating ? 'Validando…' : 'Já ativei, validar agora'}
        </Button>
      </div>
    </div>
  );
}

function ValidatingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-brand-green/30 bg-brand-green/[0.04] p-6 flex items-center gap-3"
    >
      <Spinner size={28} weight="bold" className="text-brand-green animate-spin shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-body-md font-medium text-fg-on-dark">Validando dataLayer…</p>
        <p className="text-body-sm text-fg-on-dark-muted">
          Estamos confirmando que o tracking está rodando no seu site.
        </p>
      </div>
    </div>
  );
}

function InstalledState({
  site,
  containerId,
  onViewDetails,
  onGoToDashboard,
}: {
  site: EnrichedSite;
  containerId?: string;
  onViewDetails?: () => void;
  onGoToDashboard: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="assertive"
      className="rounded-xl border border-brand-green/40 bg-brand-green/[0.06] p-6 flex flex-col gap-4 items-center text-center"
    >
      <CheckCircle size={64} weight="fill" className="text-brand-green" aria-hidden="true" />
      <div>
        <p className="text-h3 font-semibold text-fg-on-dark">Tudo certo!</p>
        <p className="text-body-md text-fg-on-dark-muted mt-1">
          Tracking instalado em <span className="font-mono">{site.domain}</span>
        </p>
        {containerId && (
          <p className="text-caption font-mono text-fg-on-dark-subtle mt-1">
            Container: <span className="text-brand-green">{containerId}</span>
          </p>
        )}
      </div>

      <ul className="text-body-sm text-fg-on-dark text-left max-w-md flex flex-col gap-1.5 list-none">
        <li className="flex items-start gap-2">
          <CheckCircle size={16} weight="fill" className="text-brand-green shrink-0 mt-0.5" aria-hidden="true" />
          <span>Container GTM provisionado</span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle size={16} weight="fill" className="text-brand-green shrink-0 mt-0.5" aria-hidden="true" />
          <span>Plugin GTM4WP instalado e ativo</span>
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle size={16} weight="fill" className="text-brand-green shrink-0 mt-0.5" aria-hidden="true" />
          <span>dataLayer validado — eventos chegando</span>
        </li>
      </ul>

      <div className="flex items-center gap-3 flex-wrap justify-center pt-2">
        {onViewDetails && (
          <Button variant="ghost" type="button" onClick={onViewDetails}>
            Ver detalhes do site
          </Button>
        )}
        <Button type="button" size="lg" onClick={onGoToDashboard} data-autofocus>
          Ir pro dashboard →
        </Button>
      </div>
    </div>
  );
}

function FailedState({
  site,
  errorMessage,
  step,
  onRetry,
  onBack,
}: {
  site: EnrichedSite;
  errorMessage: string;
  step: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const isUpload = step === 'upload_failed' || step === 'failed';
  const suggestions = isUpload
    ? [
        'Confirme que sua conta Hostinger ainda está ativa.',
        'Verifique cota de disco / quota da hospedagem.',
        'Tente reinstalar em alguns minutos (pode ser instabilidade transitória).',
      ]
    : [
        'Confirme que o plugin GTM4WP está ativo em wp-admin → Plugins.',
        'Limpe cache do WordPress se houver plugin de cache.',
        'Verifique se o container ID está correto na config do plugin.',
      ];

  return (
    <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <WarningCircle size={28} weight="duotone" className="text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-body-lg font-medium text-fg-on-dark">Falha na instalação</p>
          <p className="text-body-sm text-fg-on-dark-muted mt-1">
            Site: <span className="font-mono">{site.domain}</span>
          </p>
          <p className="text-body-sm text-fg-on-dark mt-2">{errorMessage}</p>
          <p className="text-caption font-mono text-fg-on-dark-subtle mt-1">
            Step que falhou: {step}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
        <p className="text-body-sm font-medium text-fg-on-dark mb-2">Sugestões:</p>
        <ul className={cn('text-body-sm text-fg-on-dark-muted', 'list-disc pl-5 flex flex-col gap-1')}>
          {suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button variant="ghost" type="button" onClick={onBack}>
          ← Voltar
        </Button>
        <Button type="button" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
