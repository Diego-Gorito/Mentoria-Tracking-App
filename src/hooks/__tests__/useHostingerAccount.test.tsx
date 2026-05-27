// useHostingerAccount.test.tsx — F-S11 AC-2 + AC-6 + AC-7
// Cenários:
//   1) mount → carrega 1ª account de GET /api/hosting-accounts
//   2) connect() falha 401 → connectError PT-BR "Sessão expirada"
//   3) connect() success + isConnecting flag transita true → false

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useHostingerAccount } from '../useHostingerAccount';
import type { HostingAccount } from '@/types/hosting';

const mockAccount: HostingAccount = {
  id: 'acc-1',
  provider: 'hostinger',
  account_label: 'Pessoal',
  status: 'active',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useHostingerAccount (F-S11 AC-2)', () => {
  it('mount → carrega 1ª account de GET /api/hosting-accounts', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [mockAccount] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useHostingerAccount());

    await waitFor(() => expect(result.current.account).not.toBeNull());

    expect(result.current.account?.id).toBe('acc-1');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.connectError).toBeNull();
  });

  it('connect() falha 401 → connectError PT-BR "Sessão expirada" (AC-6)', async () => {
    const fetchMock = vi
      .fn()
      // 1ª chamada: GET no mount → vazio
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      // 2ª chamada: POST connect → 401
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token inválido' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useHostingerAccount());

    // Aguarda mount terminar.
    await waitFor(() => expect(result.current.account).toBeNull());

    await act(async () => {
      await expect(result.current.connect('bad-token', 'Pessoal')).rejects.toThrow(
        /Sessão expirada/,
      );
    });

    await waitFor(() => expect(result.current.connectError).not.toBeNull());
    expect(result.current.connectError?.message).toMatch(/Sessão expirada/);
    expect(result.current.isConnecting).toBe(false);
  });

  it('connect() success popula account + isConnecting transita true → false', async () => {
    const fetchMock = vi
      .fn()
      // 1ª: GET mount → vazio
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      // 2ª: POST connect → 201
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockAccount }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useHostingerAccount());

    await waitFor(() => expect(result.current.account).toBeNull());

    await act(async () => {
      await result.current.connect('good-token', 'Pessoal');
    });

    expect(result.current.account?.id).toBe('acc-1');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.connectError).toBeNull();
  });
});
