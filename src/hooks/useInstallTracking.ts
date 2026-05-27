// useInstallTracking.ts — F-S11 AC-3 + F-S12 SSE integration
// Tracking de install GTM: cria installation + dispara deploy + observa progresso.
//
// Stack (F-S12 integrated):
//   - start(brandSlug, ctx?) → POST /api/installations + POST /:id/deploy
//   - EventSource `/api/installations/:id/events?token=<jwt>` (SSE real-time)
//   - Fallback polling 2s em onerror (F-S12 AC-6)
//
// EventSource browser limitação: não suporta custom headers. Solução: anexar
// JWT como `?token=` query param. Backend authMiddleware aceita ambos
// (Authorization header preferido, ?token fallback). Tradeoff de segurança:
// token aparece em access logs server — aceito MVP pra simplicidade.
//
// Eventos SSE publicados pelo worker (F-S12 backend, ordem happy path):
//   upload_started → upload_complete (timing_ms) → activation_started →
//   validation_started → validation_passed (timing_ms) → installed (timing_ms total)
// Failure: validation_failed OU (catch) upload_failed + terminal failed (error)
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
import { getToken } from '@/lib/auth';
import type { BrandSlug } from '@/types/sites';
import type { GtmInstallation, ValidationResult } from '@/types/hosting';

/** Shape canônica dos eventos SSE publicados pelo worker (F-S12 sseBus). */
interface SseEventPayload {
  step: string;
  status: 'in_progress' | 'done' | 'failed';
  timing_ms?: number;
  error?: string;
}

// Codex adversarial #4 fix (2026-05-27): `pending_activation` virou terminal
// step do deploy MVP — plugin foi subido, aguarda ativação manual no wp-admin.
// UI fecha modal de progresso, mostra CTA "Revalidar agora" que dispara
// `POST /api/installations/:id/revalidate` (validator F-S06).
const TERMINAL_STEPS = new Set(['installed', 'failed', 'pending_activation']);

export type InstallTrackingStatus =
  | 'idle'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'pending_activation';

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
  const eventSourceRef = useRef<EventSource | null>(null);
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
      if (eventSourceRef.current !== null) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const stopEventSource = useCallback(() => {
    if (eventSourceRef.current !== null) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Polling fallback (F-S12 AC-6): usado quando EventSource falha (proxy block,
  // browser sem suporte) OU como mecanismo backup pra status terminal mesmo se
  // SSE perder o evento final.
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

            // Map status backend (8 buckets) → UI status (5 buckets) + progress step.
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
            } else if (fresh.status === 'uploaded_pending_activation') {
              // Codex #4: terminal do deploy MVP — aguarda ativação manual.
              setStatus('pending_activation');
              setProgress({ step: 'pending_activation', status: 'done' });
              stopPolling();
            } else {
              // uploading / activating / validating / draft
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

  // F-S12 SSE subscribe — abre EventSource e atualiza progress step-by-step.
  // Fallback pra startPolling em onerror (AC-6).
  const startSSE = useCallback(
    (installationId: string) => {
      stopEventSource();
      // EventSource não suporta Authorization header — anexa token via query.
      const token = getToken();
      if (!token) {
        // Sem token Supabase → cai direto no polling (que via apiFetch usa header).
        startPolling(installationId);
        return;
      }
      const url = `/api/installations/${installationId}/events?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (ev) => {
        if (!mountedRef.current) return;
        let evt: SseEventPayload;
        try {
          evt = JSON.parse(ev.data) as SseEventPayload;
        } catch {
          // Payload malformado — ignora (defensivo)
          return;
        }
        setProgress({
          step: evt.step,
          status: evt.status,
          timing_ms: evt.timing_ms,
        });
        if (TERMINAL_STEPS.has(evt.step)) {
          if (evt.step === 'installed') setStatus('installed');
          else if (evt.step === 'failed') setStatus('failed');
          else if (evt.step === 'pending_activation') setStatus('pending_activation');
          stopEventSource();
          // Polling pós-SSE close pega install state final (last_validation_result).
          startPolling(installationId);
        }
      };

      es.onerror = () => {
        // EventSource falhou (proxy timeout, network, browser) — degrada pra polling.
        if (!mountedRef.current) return;
        stopEventSource();
        startPolling(installationId);
      };
    },
    [startPolling, stopEventSource],
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

        // 3) F-S12 SSE subscribe (com fallback polling em onerror)
        startSSE(installation.id);
      } catch (err) {
        if (!mountedRef.current) throw err;
        const translated = translateApiError(err);
        setStatus('failed');
        setProgress({ step: 'failed', status: 'failed' });
        throw translated;
      }
    },
    [startSSE],
  );

  return useMemo(
    () => ({ install, progress, status, result, start, setSiteContext }),
    [install, progress, status, result, start, setSiteContext],
  );
}
