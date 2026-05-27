import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGtmCloneJanitor } from '../gtm-clone-janitor';
import type { GtmApiClient, GtmContainer } from '../../lib/gtm';

function makeContainer(id: string, publicId: string, ageMs: number): GtmContainer {
  return {
    path: `accounts/X/containers/${id}`,
    accountId: 'X',
    containerId: id,
    name: `container-${id}`,
    publicId,
    usageContext: ['web'],
    fingerprint: String(Date.now() - ageMs),
  };
}

function mockSupabase(trackedIds: string[]) {
  return {
    schema: () => ({
      from: (_t: string) => ({
        select: () => Promise.resolve({
          data: trackedIds.map((id) => ({
            web_container_internal_id: id,
            server_container_internal_id: null,
          })),
          error: null,
        }),
        insert: (_payload: unknown) => Promise.resolve({ error: null }),
      }),
    }),
  };
}

describe('gtm-clone-janitor', () => {
  let logs: Array<{ level: string; msg: string; meta?: unknown }> = [];
  const logger = {
    info: (msg: string, meta?: unknown) => logs.push({ level: 'info', msg, meta }),
    error: (msg: string, meta?: unknown) => logs.push({ level: 'error', msg, meta }),
  };

  beforeEach(() => {
    logs = [];
  });

  it('skipa containers já tracked no DB', async () => {
    const gtmContainers = [
      makeContainer('100', 'GTM-AAA', 48 * 60 * 60 * 1000),
      makeContainer('200', 'GTM-BBB', 48 * 60 * 60 * 1000),
    ];
    const gtmClient = {
      listContainers: vi.fn(async () => gtmContainers),
      deleteContainer: vi.fn(async () => {}),
    } as unknown as GtmApiClient;
    const supabase = mockSupabase(['100', '200']) as unknown as Parameters<typeof runGtmCloneJanitor>[0]['supabase'];

    const result = await runGtmCloneJanitor({
      gtmClient,
      supabase,
      gtmAccountId: 'X',
      logger,
    });

    expect(result.scanned).toBe(2);
    expect(result.orphansFound).toBe(0);
    expect(result.orphansDeleted).toBe(0);
    expect(gtmClient.deleteContainer).not.toHaveBeenCalled();
  });

  it('identifica orphans e deleta os com idade > minAge', async () => {
    const gtmContainers = [
      makeContainer('100', 'GTM-AAA', 48 * 60 * 60 * 1000), // 48h velho → órfão
      makeContainer('200', 'GTM-BBB', 60 * 60 * 1000),     // 1h velho → muito novo
    ];
    const gtmClient = {
      listContainers: vi.fn(async () => gtmContainers),
      deleteContainer: vi.fn(async () => {}),
    } as unknown as GtmApiClient;
    const supabase = mockSupabase([]) as unknown as Parameters<typeof runGtmCloneJanitor>[0]['supabase'];

    const result = await runGtmCloneJanitor({
      gtmClient,
      supabase,
      gtmAccountId: 'X',
      logger,
    });

    expect(result.scanned).toBe(2);
    expect(result.orphansFound).toBe(2);
    expect(result.orphansDeleted).toBe(1);
    expect(result.skippedYoung).toBe(1);
    expect(gtmClient.deleteContainer).toHaveBeenCalledOnce();
    expect(gtmClient.deleteContainer).toHaveBeenCalledWith('X', '100');
  });

  it('dryRun não chama deleteContainer', async () => {
    const gtmContainers = [makeContainer('100', 'GTM-AAA', 48 * 60 * 60 * 1000)];
    const gtmClient = {
      listContainers: vi.fn(async () => gtmContainers),
      deleteContainer: vi.fn(async () => {}),
    } as unknown as GtmApiClient;
    const supabase = mockSupabase([]) as unknown as Parameters<typeof runGtmCloneJanitor>[0]['supabase'];

    const result = await runGtmCloneJanitor({
      gtmClient,
      supabase,
      gtmAccountId: 'X',
      dryRun: true,
      logger,
    });

    expect(result.orphansFound).toBe(1);
    expect(result.orphansDeleted).toBe(0);
    expect(gtmClient.deleteContainer).not.toHaveBeenCalled();
  });

  it('coleta erros em deletions sem abortar batch', async () => {
    const gtmContainers = [
      makeContainer('100', 'GTM-AAA', 48 * 60 * 60 * 1000),
      makeContainer('200', 'GTM-BBB', 48 * 60 * 60 * 1000),
    ];
    let callCount = 0;
    const gtmClient = {
      listContainers: vi.fn(async () => gtmContainers),
      deleteContainer: vi.fn(async () => {
        callCount++;
        if (callCount === 1) throw new Error('quota exceeded');
      }),
    } as unknown as GtmApiClient;
    const supabase = mockSupabase([]) as unknown as Parameters<typeof runGtmCloneJanitor>[0]['supabase'];

    const result = await runGtmCloneJanitor({
      gtmClient,
      supabase,
      gtmAccountId: 'X',
      logger,
    });

    expect(result.orphansFound).toBe(2);
    expect(result.orphansDeleted).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].containerId).toBe('100');
  });
});
