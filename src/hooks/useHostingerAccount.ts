// useHostingerAccount.ts — F-S11 AC-2
// Hook gerencia account Hostinger: GET no mount + connect (POST) + disconnect (DELETE).
// MVP: 1 hosting_account por tenant — pega 1ª da lista (UX §3 Tela 1).
// Erros PT-BR via translateApiError; isConnecting flag bloqueia 2× submit (Edge Case 3).

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/sitesApi';
import { translateApiError } from '@/lib/translateApiError';
import type { HostingAccount } from '@/types/hosting';

export interface UseHostingerAccountResult {
  account: HostingAccount | null;
  isConnected: boolean;
  connect: (token: string, label?: string, wpAdminPass?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  isConnecting: boolean;
  connectError: Error | null;
}

export function useHostingerAccount(): UseHostingerAccountResult {
  const [account, setAccount] = useState<HostingAccount | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Mount — GET /api/hosting-accounts → pega 1ª.
  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const response = await apiFetch<{ data: HostingAccount[] }>('/api/hosting-accounts', {
          signal: controller.signal,
        });
        if (!mountedRef.current) return;
        const first = response.data?.[0] ?? null;
        setAccount(first);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        // Erro de mount NÃO popula connectError (esse é só pra connect()).
        // Componente decide se exibe um banner via prop separada (F-S10).
        // Por ora, silenciosamente trata como "sem account".
        setAccount(null);
      }
    })();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, []);

  const connect = useCallback(
    async (token: string, label?: string, wpAdminPass?: string): Promise<void> => {
      if (isConnecting) return; // Edge Case 3 — bloqueia duplo submit.
      setIsConnecting(true);
      setConnectError(null);
      try {
        const response = await apiFetch<{ data: HostingAccount }>('/api/hosting-accounts', {
          method: 'POST',
          body: {
            provider: 'hostinger',
            token,
            label: label && label.length > 0 ? label : 'Hostinger',
            wp_admin_password: wpAdminPass,
          },
        });
        if (!mountedRef.current) return;
        setAccount(response.data ?? null);
      } catch (err) {
        if (!mountedRef.current) throw err;
        const translated = translateApiError(err);
        setConnectError(translated);
        throw translated;
      } finally {
        if (mountedRef.current) setIsConnecting(false);
      }
    },
    [isConnecting],
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (!account) return;
    try {
      await apiFetch<void>(`/api/hosting-accounts/${account.id}`, { method: 'DELETE' });
      if (!mountedRef.current) return;
      setAccount(null);
      setConnectError(null);
    } catch (err) {
      if (!mountedRef.current) throw err;
      const translated = translateApiError(err);
      setConnectError(translated);
      throw translated;
    }
  }, [account]);

  return {
    account,
    isConnected: account !== null && account.status === 'active',
    connect,
    disconnect,
    isConnecting,
    connectError,
  };
}
