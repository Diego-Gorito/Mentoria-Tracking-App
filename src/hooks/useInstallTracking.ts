// useInstallTracking.ts — F-S11 AC-3
// Tracking de install GTM: cria installation + dispara deploy + observa progresso.
//
// Stack atual (Onda 1):
//   - start(brandSlug) → POST /api/installations + POST /api/installations/:id/deploy
//   - Polling fallback `GET /api/installations/:id` a cada 2s até status final.
//
// @todo F-S12 — substituir polling por EventSource subscribe gtm:events:<id>
//   via /api/installations/:id/events (SSE). Quando F-S12 lançar:
//     1) Remover startPolling() / setInterval
//     2) Abrir EventSource(`/api/installations/${id}/events`) em start()
//     3) onmessage → atualizar progress step-by-step
//     4) Final event 'installed' | 'failed' → atualizar status
//     5) Cleanup unsubscribe SSE em useEffect cleanup
//     6) Manter fallback polling pra error onerror (F-S12 AC-6)
//
// Edge Case 5 (story): segundo start() pode receber 409 → translateApiError
// transforma em "Outro deploy em andamento" (caller deve toast).
//
// Sobre o param `siteId`:
//   - Não conseguimos chamar POST /api/installations sem `hosting_account_id`
//     + `site_domain`. Story define signature minimal mas omite isso.
//   - Decisão: extendemos `start` com 2º arg opcional `{ hostingAccountId, siteDomain }`.
//     Quando ausentes, caller deve ter chamado `setSiteContext` antes (refs internos).
//   - Esse padrão permite F-S10 SiteCard fazer `start('mentoria', { hostingAccountId,
//     siteDomain })` direto, OU pre-configurar context via setSiteContext em useEffect.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/sitesApi';
import { translateApiError } from '@/lib/translateApiError';
import type { BrandSlug } from '@/types/sites';
import type { GtmInstallation, ValidationResult } from '@/types/hosting';

export type InstallTrackingStatus = 'idle' | 'installing' | 'installed' | 'failed';

export interface ProgressState {
  step: string;
  status: 'in_progress' | 'done' | 'failed';
  timing_ms?: number;
}

export interface StartContext {
  hostingAccountId: string;
  siteDomain: string;
}

export interface UseInstallTrackingResult {
  install: GtmInstallation | null;
  progress: ProgressState;
  status: InstallTrackingStatus;
  result: ValidationResult | null;
  /**
   * Cria installation + dispara deploy + começa polling/SSE.
   * Story signature mínima é `(brandSlug)` mas precisamos do contexto
   * `hostingAccountId + siteDomain`. Caller passa via 2º arg OU pré-configura
   * via `setSiteContext` antes.
   */
  start: (brandSlug: BrandSlug, ctx?: StartContext) => Promise<void>;
  /** Pré-configura contexto pro start() sem 2º arg (usado por F-S10 SiteCard). */
  setSiteContext: (ctx: StartContext) => void;
}

const POLL_INTERVAL_MS = 2000;

export function useInstallTracking(siteId: string): UseInstallTrackingResult {
  // siteId é parte da interface (story AC-3); usamos pra reset state cross-site
  // — quando o user troca de card, F-S10 remonta o hook com novo siteId.
  void siteId;

  const [install, setInstall] = useState<GtmInstallation | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    step: 'idle',
    status: 'in_progress',
  });
  const [status, setStatus] = useState<InstallTrackingStatus>('idle');
  const [result, setResult] = useState<ValidationResult | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const siteContextRef = useRef<StartContext | null>(null);

  // Cleanup global em unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Polling fallback até EventSource F-S12.
  const startPolling = useCallback(
    (installationId: string) => {
      stopPolling();
      pollIntervalRef.current = setInterval(() => {
        (async () => {
          try {
            const response = await apiFetch<{ data: GtmInstallation }>(
              `/api/installations/${installationId}`,
            );
            if (!mountedRef.current) return;
            const fresh = response.data;
            setInstall(fresh);

            // Map status backend (8 buckets) → UI status (4 buckets) + progress step.
            if (fresh.status === 'installed') {
              setStatus('installed');
              setProgress({ step: 'validated', status: 'done' });
              if (fresh.last_validation_result) {
                setResult({
                  passed: fresh.last_validation_result.passed,
                  stage: fresh.last_validation_result.stage,
                  details: fresh.last_validation_result.details,
                  reason: fresh.last_validation_result.reason,
                });
              }
              stopPolling();
            } else if (fresh.status === 'failed') {
              setStatus('failed');
              setProgress({ step: 'failed', status: 'failed' });
              if (fresh.last_validation_result) {
                setResult({
                  passed: fresh.last_validation_result.passed,
                  stage: fresh.last_validation_result.stage,
                  details: fresh.last_validation_result.details,
                  reason: fresh.last_validation_result.reason,
                });
              }
              stopPolling();
            } else {
              // uploading / activating / validating / draft / uploaded_pending_activation
              setStatus('installing');
              setProgress({ step: fresh.status, status: 'in_progress' });
            }
          } catch {
            // Polling error não derruba — backend pode estar processando.
            // Loop continua até unmount.
          }
        })();
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  const setSiteContext = useCallback((ctx: StartContext): void => {
    siteContextRef.current = ctx;
  }, []);

  const start = useCallback(
    async (brandSlug: BrandSlug, ctx?: StartContext): Promise<void> => {
      const effective = ctx ?? siteContextRef.current;
      if (!effective) {
        const err = new Error(
          'useInstallTracking.start: contexto ausente — passe { hostingAccountId, siteDomain } via 2º arg ou setSiteContext().',
        );
        setStatus('failed');
        setProgress({ step: 'config_missing', status: 'failed' });
        throw err;
      }

      setStatus('installing');
      setProgress({ step: 'creating_draft', status: 'in_progress' });
      setResult(null);

      try {
        // 1) POST /api/installations → cria draft
        const created = await apiFetch<{ data: GtmInstallation }>('/api/installations', {
          method: 'POST',
          body: {
            hosting_account_id: effective.hostingAccountId,
            site_domain: effective.siteDomain,
            brand_slug: brandSlug,
          },
        });
        if (!mountedRef.current) return;
        const installation = created.data;
        setInstall(installation);
        setProgress({ step: 'deploying', status: 'in_progress' });

        // 2) POST /api/installations/:id/deploy → dispara worker async
        await apiFetch<{ data: { job_id: string; sse_url: string } }>(
          `/api/installations/${installation.id}/deploy`,
          { method: 'POST' },
        );
        if (!mountedRef.current) return;

        // 3) @todo F-S12 — substituir startPolling por:
        //    const es = new EventSource(`/api/installations/${installation.id}/events`);
        //    es.onmessage = ev => { progress = JSON.parse(ev.data); ... };
        //    es.onerror = () => startPolling(installation.id); // fallback F-S12 AC-6
        startPolling(installation.id);
      } catch (err) {
        if (!mountedRef.current) throw err;
        const translated = translateApiError(err);
        setStatus('failed');
        setProgress({ step: 'failed', status: 'failed' });
        throw translated;
      }
    },
    [startPolling],
  );

  return useMemo(
    () => ({ install, progress, status, result, start, setSiteContext }),
    [install, progress, status, result, start, setSiteContext],
  );
}
