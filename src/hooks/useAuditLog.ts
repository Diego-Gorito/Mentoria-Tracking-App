// useAuditLog.ts — F-S11 AC-4
// Hook GET /api/installations/:installationId/audit-log → InstallationAudit[].
//
// Backend status MVP:
//   - F-S05 implementa append em `appendAuditWithSanitization` mas o endpoint
//     READ GET /api/installations/:id/audit-log AINDA NÃO EXISTE em workers/api/installations.ts.
//   - @todo backend dev — adicionar GET `/api/installations/:id/audit-log`
//     retornando `{ data: InstallationAudit[] }` (mais recente primeiro, top 50).
//   - Hook funciona "quando endpoint estiver lá"; mantemos contract preparado
//     pra não bloquear F-S10/F-S14.
//
// Comportamento per AC-4:
//   - siteId fornecido (assumimos = installation_id no MVP) → fetch endpoint.
//   - siteId undefined → não fetch, retorna entries=[]. Cross-installation
//     global = Onda 1.5 (story comment).

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/sitesApi';
import { translateApiError } from '@/lib/translateApiError';
import type { InstallationAudit } from '@/types/sites';

export interface UseAuditLogResult {
  entries: InstallationAudit[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useAuditLog(siteId?: string): UseAuditLogResult {
  const [entries, setEntries] = useState<InstallationAudit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(siteId));
  const [error, setError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchAudit = useCallback(async (): Promise<void> => {
    if (!siteId) {
      setEntries([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      // @todo backend — adicionar GET /api/installations/:id/audit-log
      // (F-S05 escreve mas não expõe leitura ainda; story F-S11 assume).
      const response = await apiFetch<{ data: InstallationAudit[] }>(
        `/api/installations/${siteId}/audit-log`,
        { signal: controller.signal },
      );
      if (!mountedRef.current) return;
      setEntries(response.data ?? []);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(translateApiError(err));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [siteId]);

  const refresh = useCallback(async (): Promise<void> => {
    await fetchAudit();
  }, [fetchAudit]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchAudit();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchAudit]);

  return { entries, isLoading, error, refresh };
}
