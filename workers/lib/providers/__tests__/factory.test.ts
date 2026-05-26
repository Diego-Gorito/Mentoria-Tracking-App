/**
 * Tests pra factory `getProvider()` + stub `HostingerAdapter`.
 * Cobre AC-5 da story F-S03 + edge cases.
 *
 * @see docs/specs/F-S03-provider-interface-spec.md §8.1
 */

import { describe, expect, it, vi } from 'vitest';
import { HostingerAdapter, TokenInvalidError, getProvider } from '../index';
import type { IHostingProvider, ProviderType } from '../index';

describe('getProvider() factory', () => {
  it('returns HostingerAdapter instance for type="hostinger"', () => {
    const provider = getProvider('hostinger', { token: 'fake-token' });
    expect(provider).toBeInstanceOf(HostingerAdapter);
    expect(typeof provider.listSites).toBe('function');
    expect(typeof provider.verifyDomain).toBe('function');
    expect(typeof provider.deployPlugin).toBe('function');
    expect(typeof provider.pingToken).toBe('function');
  });

  it('throws "Onda 2" error for type="wp_rest"', () => {
    expect(() => getProvider('wp_rest', { token: 'fake-token' })).toThrow(/Onda 2/);
  });

  it('throws "Unknown provider" error for unknown type', () => {
    expect(() =>
      getProvider('unknown' as unknown as ProviderType, { token: 'fake-token' }),
    ).toThrow(/Unknown provider/);
  });

  it('HostingerAdapter rejects invalid token with TokenInvalidError (F-S04 real impl)', async () => {
    // F-S03 stub days: este assert validava `/Not implemented/`. F-S04 substituiu
    // o stub por impl real (REST fetch). Comportamento agora: 401 upstream
    // mapeia pra TokenInvalidError per ADR-0008 §3.8.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = getProvider('hostinger', { token: 'fake-token' });
    await expect(adapter.listSites()).rejects.toBeInstanceOf(TokenInvalidError);

    vi.unstubAllGlobals();
  });

  it('accepts optional wpAdminPassword in credentials', () => {
    const provider = getProvider('hostinger', {
      token: 'fake-token',
      wpAdminPassword: 'secret',
    });
    expect(provider).toBeInstanceOf(HostingerAdapter);
  });
});

// Type-only assertion — fails tsc se HostingerAdapter sair fora do contrato.
const _h: IHostingProvider = new HostingerAdapter({ token: 'x' });
void _h;
