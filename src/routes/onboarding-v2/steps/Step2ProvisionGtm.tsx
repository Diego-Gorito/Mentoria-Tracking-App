/**
 * Step2ProvisionGtm — provisionar container GTM via /api/gtm/provision-container.
 *
 * Estados visíveis:
 *  - idle → form com PixelIdsForm + CTA "Provisionar container"
 *  - provisioning → mensagem + estimativa (~8min) + cancel desabilitado
 *  - active → mensagem sucesso + auto-advance via useEffect → onComplete
 *  - failed → erro + retry
 *
 * O polling do status acontece via `useGtmContainer().info?.status`. O hook
 * já refetch quando `refresh()` é chamado — chamamos isso periodicamente.
 */

import { useId, useEffect, useState, useRef, useCallback } from 'react';
import { GearSix, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTenant } from '@/hooks/useTenant';
import { useGtmContainer, type PlatformKey } from '@/hooks/useGtmContainer';
import { PixelIdsForm } from '@/components/onboarding/PixelIdsForm';

interface Props {
  pixelIds: Partial<Record<PlatformKey, string>>;
  onChangePixelIds: (next: Partial<Record<PlatformKey, string>>) => void;
  onComplete: () => void;
  onBack: () => void;
}

// Polling interval pra status do container quando estamos esperando.
const POLL_MS = 6_000;

type ProvisionPhase = 'idle' | 'provisioning' | 'active' | 'failed';

export function Step2ProvisionGtm({
  pixelIds,
  onChangePixelIds,
  onComplete,
  onBack,
}: Props) {
  const uid = useId();
  const { tenant, loading: tenantLoading } = useTenant();
  const { info, loading: gtmLoading, refresh, provision } = useGtmContainer();
  const { toast } = useToast();

  const [phase, setPhase] = useState<ProvisionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect status do container atual (vindo do hook).
  // Se já está `active`, pula direto pra success.
  useEffect(() => {
    if (gtmLoading || tenantLoading) return;
    const status = info?.status;
    if (!status || status === 'not_provisioned') {
      if (phase !== 'provisioning' && phase !== 'failed') setPhase('idle');
      return;
    }
    if (status === 'active') {
      setPhase('active');
    } else if (status === 'failed') {
      setPhase('failed');
      setError(info?.error_message ?? 'Provisionamento falhou.');
    } else if (
      status === 'pending' ||
      status === 'cloning' ||
      status === 'linking' ||
      status === 'publishing'
    ) {
      setPhase('provisioning');
    }
  }, [info?.status, info?.error_message, gtmLoading, tenantLoading, phase]);

  // Polling enquanto provisioning.
  useEffect(() => {
    if (phase !== 'provisioning') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(() => refresh(), POLL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [phase, refresh]);

  // Cronômetro de elapsed enquanto provisioning.
  useEffect(() => {
    if (phase !== 'provisioning' || !startedAt) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [phase, startedAt]);

  // Auto-advance quando active — pequeno delay pro user ler o sucesso.
  useEffect(() => {
    if (phase !== 'active') return;
    const t = setTimeout(() => onComplete(), 1500);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  const handleProvision = useCallback(async () => {
    if (!tenant?.slug) {
      toast('Tenant não resolvido. Faça login novamente.', 'error');
      return;
    }
    setError(null);
    setPhase('provisioning');
    setStartedAt(Date.now());
    setElapsedSec(0);
    try {
      await provision({
        tenant_slug: tenant.slug,
        pixel_ids: pixelIds,
      });
      // provision() já chama refresh() internamente — useEffect vai detectar
      // status `active` ou continuar polling até.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao provisionar.';
      setError(message);
      setPhase('failed');
      toast(message, 'error');
    }
  }, [tenant?.slug, provision, pixelIds, toast]);

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-green border-t-transparent" />
      </div>
    );
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <GearSix size={20} weight="duotone" className="text-brand-green" aria-hidden="true" />
          <span className="text-caption font-mono text-fg-on-dark-subtle uppercase tracking-wide">
            Passo 2 de 4
          </span>
        </div>
        <h2
          id={`${uid}-title`}
          className="text-h2 font-semibold text-fg-on-dark"
          tabIndex={-1}
        >
          Vamos provisionar seu GTM
        </h2>
        <p className="text-body-md text-fg-on-dark-muted">
          Criamos seu container Google Tag Manager (web + server-side) clonando
          nosso master pré-configurado. Esse passo demora ~8 minutos — pode
          deixar rodando.
        </p>
      </header>

      {/* idle — form de pixel IDs + CTA */}
      {phase === 'idle' && (
        <div className="flex flex-col gap-5">
          <PixelIdsForm value={pixelIds} onChange={onChangePixelIds} />

          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <Button variant="ghost" type="button" onClick={onBack}>
              ← Voltar
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={handleProvision}
              data-autofocus
            >
              Provisionar container →
            </Button>
          </div>
        </div>
      )}

      {/* provisioning — progress + estimated */}
      {phase === 'provisioning' && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-brand-green/30 bg-brand-green/[0.04] p-6 flex flex-col gap-3 items-center text-center"
        >
          <div className="h-12 w-12 rounded-full border-2 border-brand-green border-t-transparent animate-spin" />
          <p className="text-body-lg font-medium text-fg-on-dark">
            Clonando container GTM…
          </p>
          <p className="text-body-sm text-fg-on-dark-muted max-w-md">
            Estamos copiando 57 tags + 14 triggers + 62 variáveis do nosso
            master. Tempo médio: 8 minutos. Você pode continuar usando o app —
            voltamos aqui automaticamente quando terminar.
          </p>
          <p className="text-caption font-mono text-fg-on-dark-subtle tabular-nums">
            Decorrido: {formatElapsed(elapsedSec)}
          </p>
          {info?.failed_at_step && (
            <p className="text-caption text-amber-400">
              Reportando step: <span className="font-mono">{info.failed_at_step}</span>
            </p>
          )}
        </div>
      )}

      {/* active — sucesso + auto-advance */}
      {phase === 'active' && (
        <div
          role="status"
          aria-live="assertive"
          className="rounded-xl border border-brand-green/40 bg-brand-green/[0.06] p-6 flex flex-col gap-3 items-center text-center"
        >
          <CheckCircle size={56} weight="fill" className="text-brand-green" aria-hidden="true" />
          <p className="text-body-lg font-medium text-fg-on-dark">
            Container provisionado!
          </p>
          {info?.web_container_public_id && (
            <p className="text-caption font-mono text-fg-on-dark-muted">
              Web: <span className="text-brand-green">{info.web_container_public_id}</span>
              {info.server_container_public_id && (
                <> · Server: <span className="text-brand-green">{info.server_container_public_id}</span></>
              )}
            </p>
          )}
          <p className="text-body-sm text-fg-on-dark-muted">
            Avançando pro próximo passo…
          </p>
        </div>
      )}

      {/* failed — erro + retry */}
      {phase === 'failed' && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-6 flex flex-col gap-3"
        >
          <div className="flex items-start gap-3">
            <WarningCircle size={28} weight="duotone" className="text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-body-lg font-medium text-fg-on-dark">
                Falha no provisionamento
              </p>
              <p className="text-body-sm text-fg-on-dark-muted mt-1">
                {error ?? 'Erro desconhecido durante a clonagem.'}
              </p>
              {info?.failed_at_step && (
                <p className="text-caption font-mono text-fg-on-dark-subtle mt-2">
                  Step que falhou: {info.failed_at_step}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Button variant="ghost" type="button" onClick={onBack}>
              ← Voltar
            </Button>
            <Button type="button" onClick={handleProvision}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function formatElapsed(sec: number): string {
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min === 0) return `${s}s`;
  return `${min}min ${s.toString().padStart(2, '0')}s`;
}
