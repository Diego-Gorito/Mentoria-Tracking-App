/**
 * Tests pra factory `getProvider()` + stub `HostingerAdapter`.
 * Cobre AC-5 da story F-S03 + edge cases.
 *
 * @see docs/specs/F-S03-provider-interface-spec.md §8.1
 */

import { describe, expect, it } from 'vitest';
import { HostingerAdapter, getProvider } from '../index';
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

  it('HostingerAdapter stub methods reject with /Not implemented/', async () => {
    const adapter = getProvider('hostinger', { token: 'fake-token' });
    await expect(adapter.listSites()).rejects.toThrow(/Not implemented/);
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
