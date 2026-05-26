/**
 * Tests pra `safeAuditPayload` + `appendAuditWithSanitization` — helpers F-S07.
 *
 * Cobertura AC-7 (5 cenários):
 *  1. Whitelist preserva 7 keys aceitas
 *  2. Blacklist remove 6 keys sensíveis silenciosamente
 *  3. error_summary trunca 1000 → 500 chars
 *  4. Nested: blacklist recursivo remove keys sensíveis em nível 2
 *  5. Mixed: keep safe + drop sensitive
 *
 * Plus wrapper (AC-5):
 *  - chama storage.appendAudit com payload sanitizado
 *  - rawPayload undefined → payload final é `{}`
 *
 * @see workers/lib/audit.ts
 * @see docs/adr-0008-auto-provisioner-gtm-architecture.md §3.7
 */

import { describe, expect, it, vi } from 'vitest';
import { appendAuditWithSanitization, safeAuditPayload } from '../audit';
import type { IGtmStorage } from '../storage/IStorage';
import type { InstallationId, TenantId } from '../storage/types';

describe('safeAuditPayload', () => {
  it('whitelist preserva 7 keys aceitas (AC-2)', () => {
    const r = safeAuditPayload({
      site_domain: 'x.com',
      status_code: 200,
      timing_ms: 350,
      file_count: 12,
      upload_dir_name: 'gtm4wp-abc',
      error_summary: 'short err',
      retry_attempt: 2,
    });
    expect(Object.keys(r).sort()).toEqual([
      'error_summary',
      'file_count',
      'retry_attempt',
      'site_domain',
      'status_code',
      'timing_ms',
      'upload_dir_name',
    ]);
    expect(r.site_domain).toBe('x.com');
    expect(r.retry_attempt).toBe(2);
  });

  it('blacklist remove 6 keys sensíveis silenciosamente (AC-3)', () => {
    const r = safeAuditPayload({
      token: 'abc123',
      password: 'foo',
      secret: 'bar',
      bearer: 'xyz',
      authorization: 'Auth: Bearer',
      api_key: 'k',
      site_domain: 'safe.com',
    });
    expect(r).toEqual({ site_domain: 'safe.com' });
    expect(r).not.toHaveProperty('token');
    expect(r).not.toHaveProperty('password');
    expect(r).not.toHaveProperty('secret');
    expect(r).not.toHaveProperty('bearer');
    expect(r).not.toHaveProperty('authorization');
    expect(r).not.toHaveProperty('api_key');
  });

  it('error_summary trunca 1000 chars → 500 sem reticências (AC-4)', () => {
    const r = safeAuditPayload({ error_summary: 'x'.repeat(1000) });
    expect(r.error_summary).toHaveLength(500);
    expect(r.error_summary).toBe('x'.repeat(500));
    // Sem marcador "..."
    expect(r.error_summary?.endsWith('...')).toBe(false);
  });

  it('nested blacklist remove hostinger_token mas preserva inocente (AC-6)', () => {
    const r = safeAuditPayload({
      site_domain: 'x.com',
      // `meta` não está na whitelist top-level → será descartado.
      // Pra testar nested blacklist sem ser bloqueado pela whitelist,
      // usamos `upload_dir_name` como container plain-object (cast unknown).
      upload_dir_name: { hostinger_token: 'leak', other: 'safe' } as unknown as string,
    });
    const meta = r.upload_dir_name as unknown as Record<string, unknown>;
    expect(meta).toBeDefined();
    expect(meta.hostinger_token).toBeUndefined();
    expect(meta.other).toBe('safe');
  });

  it('mixed: keep safe + drop sensitive (AC-3 combo)', () => {
    const r = safeAuditPayload({
      site_domain: 'x.com',
      token: 'leak',
      timing_ms: 100,
    });
    expect(r).toEqual({ site_domain: 'x.com', timing_ms: 100 });
  });

  // Edge cases extras (story §Edge Cases)
  it('empty {} → {} (edge case 5)', () => {
    expect(safeAuditPayload({})).toEqual({});
  });

  it('case-insensitive blacklist: Token (capital) também rejeitado (edge case 7)', () => {
    const r = safeAuditPayload({
      Token: 'leak',
      API_KEY: 'leak2',
      site_domain: 'x.com',
    });
    expect(r).toEqual({ site_domain: 'x.com' });
  });
});

describe('appendAuditWithSanitization', () => {
  it('chama storage.appendAudit com payload sanitizado (AC-5)', async () => {
    const appendAudit = vi.fn().mockResolvedValue(undefined);
    const storage = { appendAudit } as unknown as IGtmStorage;
    await appendAuditWithSanitization(storage, {
      installation_id: 'install-1' as InstallationId,
      tenant_id: 'tenant-1' as TenantId,
      action: 'upload_complete',
      actor_source: 'tracking-api',
      rawPayload: { token: 'leak', site_domain: 'x.com', timing_ms: 350 },
    });
    expect(appendAudit).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        installation_id: 'install-1',
        tenant_id: 'tenant-1',
        action: 'upload_complete',
        actor_source: 'tracking-api',
        payload: { site_domain: 'x.com', timing_ms: 350 },
      }),
    );
    // Garante que token NÃO chegou na storage
    const call = appendAudit.mock.calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload).not.toHaveProperty('token');
  });

  it('rawPayload undefined → payload final é {} (default seguro)', async () => {
    const appendAudit = vi.fn().mockResolvedValue(undefined);
    const storage = { appendAudit } as unknown as IGtmStorage;
    await appendAuditWithSanitization(storage, {
      installation_id: 'install-2' as InstallationId,
      tenant_id: 'tenant-1' as TenantId,
      action: 'draft_created',
      actor_source: 'tracking-api',
    });
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: {} }),
    );
  });
});
