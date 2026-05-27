// useInstallTracking.test.tsx — F-S11 AC-3 + AC-6 + AC-7
// Cenários:
//   1) idle → loading → success (start cria + dispara deploy; polling resolve installed)
//   2) idle → loading → error em 409 (lock conflict) — PT-BR "Outro deploy em andamento"
//   3) refresh re-fetch via start() chamado novamente (status reset)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInstallTracking } from '../useInstallTracking';
import type { GtmInstallation } from '@/types/hosting';

const draftInstallation: GtmInstallation = {
  id: 'inst-1',
  tenant_id: 'tenant-1',
  hosting_account_id: 'acc-1',
  site_domain: 'example.com.br',
  brand_slug: 'mentoria',
  gtm_container_id: 'GTM-XYZ',
  plugin_version: 'gtm4wp-1.18',
  status: 'draft',
  attempt_count: 0,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const installedInstallation: GtmInstallation = {
  ...draftInstallation,
  status: 'installed',
  installed_at: '2025-01-01T00:01:00Z',
  last_validation_result: {
    passed: true,
    stage: 'full',
    details: {
      containerMatch: true,
      expectedMatch: true,
      datalayerMatch: true,
      expectedContainerId: 'GTM-XYZ',
    },
  },
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useInstallTracking (F-S11 AC-3)', () => {
  it('idle → installing → installed (polling resolve fim)', async () => {
    const fetchMock = vi
      .fn()
      // POST /api/installations → created draft
      .mockResolvedValueOnce(jsonRes({ data: draftInstallation }, 201))
      // POST /api/installations/:id/deploy → 202
      .mockResolvedValueOnce(
        jsonRes({ data: { job_id: 'inst-1', sse_url: '/api/installations/inst-1/events' } }, 202),
      )
      // Polling GET /api/installations/inst-1 (1ª) → status=installed
      .mockResolvedValue(jsonRes({ data: installedInstallation }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useInstallTracking('inst-1'));

    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.start('mentoria', {
        hostingAccountId: 'acc-1',
        siteDomain: 'example.com.br',
      });
    });

    // Após start(): status='installing', install populado.
    expect(result.current.install?.id).toBe('inst-1');
    expect(result.current.status).toBe('installing');

    // Avança timer pra disparar polling.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      // microtasks drain
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe('installed'));
    expect(result.current.result?.passed).toBe(true);
  });

  it('start() falha 409 → erro PT-BR "Outro deploy em andamento" (AC-6 + Edge Case 5)', async () => {
    const fetchMock = vi
      .fn()
      // POST /api/installations → 409 lock conflict
      .mockResolvedValueOnce(
        jsonRes(
          { error: { code: 'DEPLOY_IN_PROGRESS', message: 'Outro deploy ativo' } },
          409,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useInstallTracking('inst-1'));

    await act(async () => {
      await expect(
        result.current.start('mentoria', {
          hostingAccountId: 'acc-1',
          siteDomain: 'example.com.br',
        }),
      ).rejects.toThrow(/Outro deploy em andamento/);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.progress.status).toBe('failed');
  });

  it('start() sem contexto → falha imediatamente com mensagem clara', async () => {
    const { result } = renderHook(() => useInstallTracking('inst-1'));

    await act(async () => {
      await expect(result.current.start('mentoria')).rejects.toThrow(
        /contexto ausente|setSiteContext/,
      );
    });

    expect(result.current.status).toBe('failed');
  });
});
