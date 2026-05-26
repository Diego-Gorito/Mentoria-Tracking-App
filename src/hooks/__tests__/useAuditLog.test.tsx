// useAuditLog.test.tsx — F-S11 AC-4 + AC-6 + AC-7
// Cenários:
//   1) siteId definido → idle → loading → success (entries[])
//   2) siteId definido + 500 → error PT-BR "Erro no servidor — tente novamente"
//   3) siteId definido → refresh() re-fetch

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuditLog } from '../useAuditLog';
import type { InstallationAudit } from '@/types/sites';

const mockEntry: InstallationAudit = {
  id: 'audit-1',
  installation_id: 'inst-1',
  tenant_id: 'tenant-1',
  action: 'draft_created',
  payload: { site_domain: 'example.com.br' },
  actor_source: 'tracking-api',
  created_at: '2025-01-01T00:00:00Z',
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAuditLog (F-S11 AC-4)', () => {
  it('idle → loading → success popula entries', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes({ data: [mockEntry] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuditLog('inst-1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.entries).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].action).toBe('draft_created');
    expect(result.current.error).toBeNull();
  });

  it('500 → error PT-BR "Erro no servidor" (AC-6)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'algo deu errado' } }, 500),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuditLog('inst-1'));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error?.message).toMatch(/Erro no servidor/);
    expect(result.current.entries).toEqual([]);
  });

  it('refresh() re-fetch endpoint', async () => {
    const entryV2: InstallationAudit = { ...mockEntry, action: 'upload_complete' };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ data: [mockEntry] }))
      .mockResolvedValueOnce(jsonRes({ data: [mockEntry, entryV2] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuditLog('inst-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(1);

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('siteId undefined → não fetch, entries vazio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuditLog());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
