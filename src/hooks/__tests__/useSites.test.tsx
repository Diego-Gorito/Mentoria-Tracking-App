// useSites.test.tsx — F-S11 AC-1 + AC-6 + AC-7
// Cenários:
//   1) idle → loading → success
//   2) error retornado em PT-BR (network failure)
//   3) refresh() re-fetch invalida cache

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSites, __clearSitesCache } from '../useSites';
import type { EnrichedSite } from '@/types/sites';

const mockSite: EnrichedSite = {
  domain: 'example.com.br',
  is_wordpress: true,
  wp_version: '6.4.2',
};

beforeEach(() => {
  __clearSitesCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSites (F-S11 AC-1)', () => {
  it('idle → loading → success popula sites array', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [mockSite] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSites());

    // initial: isLoading=true, sites=[]
    expect(result.current.isLoading).toBe(true);
    expect(result.current.sites).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sites).toHaveLength(1);
    expect(result.current.sites[0].domain).toBe('example.com.br');
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('idle → loading → error PT-BR em network failure (AC-6)', async () => {
    // TypeError "Failed to fetch" simula offline.
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSites());

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error?.message).toMatch(/Sem conexão com o servidor/);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.sites).toEqual([]);
  });

  it('refresh() invalida cache e re-fetch', async () => {
    const updated: EnrichedSite = { ...mockSite, wp_version: '6.5.0' };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [mockSite] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [updated] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSites());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sites[0].wp_version).toBe('6.4.2');

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.sites[0].wp_version).toBe('6.5.0'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
