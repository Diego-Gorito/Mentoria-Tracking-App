// useSites.ts — F-S11 AC-1
// Hook GET /api/sites → EnrichedSite[] com cache 60s in-memory + refresh().
// Stack: custom (sem @tanstack/react-query — não instalado per F-S11 decision).
// Cleanup AbortController em unmount pra evitar warning "setState on unmounted".
// Erros traduzidos PT-BR via translateApiError (AC-6).

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/sitesApi';
import { translateApiError } from '@/lib/translateApiError';
import type { EnrichedSite } from '@/types/sites';

// ── Module-scoped cache (compartilhado entre hook instances) ─────────────────
interface CacheEntry {
  sites: EnrichedSite[];
  exp: number; // epoch ms
}
const CACHE_TTL_MS = 60_000;
const CACHE_KEY = 'sites'; // single bucket — backend já filtra por tenant via JWT
const sitesCache = new Map<string, CacheEntry>();

/** Test helper — limpa cache entre testes. NÃO usar em prod. */
export function __clearSitesCache(): void {
  sitesCache.clear();
}

export interface UseSitesResult {
  sites: EnrichedSite[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useSites(): UseSitesResult {
  const [sites, setSites] = useState<EnrichedSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // AbortController pra cleanup em unmount.
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchSites = useCallback(async (skipCache = false): Promise<void> => {
    // Tenta cache primeiro (se não for refresh forçado).
    if (!skipCache) {
      const cached = sitesCache.get(CACHE_KEY);
      if (cached && cached.exp > Date.now()) {
        setSites(cached.sites);
        setIsLoading(false);
        setError(null);
        return;
      }
    }

    // Cancela request em flight (se houver).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch<{ data: EnrichedSite[] }>('/api/sites', {
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const list = response.data ?? [];
      sitesCache.set(CACHE_KEY, { sites: list, exp: Date.now() + CACHE_TTL_MS });
      setSites(list);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(translateApiError(err));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    sitesCache.delete(CACHE_KEY);
    await fetchSites(true);
  }, [fetchSites]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchSites(false);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { sites, isLoading, error, refresh };
}
