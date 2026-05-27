/**
 * Smoke tests pra MockProvider — garante que impl in-memory respeita contrato
 * IHostingProvider e propaga errors corretamente para downstream tests F-S05+.
 *
 * @see docs/specs/F-S03-provider-interface-spec.md §8.2
 */

import { describe, expect, it } from 'vitest';
import { HostingerAdapter } from '../HostingerAdapter';
import { DomainNotOwnedError, RateLimitError, TokenInvalidError } from '../errors';
import type { IHostingProvider, Site } from '../IHostingProvider';
import { MockProvider } from '../MockProvider';

describe('MockProvider', () => {
  it('default mock: listSites returns 1 fake site with is_wordpress=true', async () => {
    const provider = new MockProvider();
    const sites = await provider.listSites();
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      domain: 'mock-site.test',
      is_wordpress: true,
    });
  });

  it('verifyDomain matches against configured sites array', async () => {
    const siteA: Site = { domain: 'siteA.com', is_wordpress: true };
    const siteB: Site = { domain: 'siteB.com', is_wordpress: true };
    const provider = new MockProvider({ sites: [siteA, siteB] });

    await expect(provider.verifyDomain('siteA.com')).resolves.toBe(true);
    await expect(provider.verifyDomain('siteB.com')).resolves.toBe(true);
    await expect(provider.verifyDomain('other.com')).resolves.toBe(false);
  });

  it('invalidToken=true propagates TokenInvalidError on listSites', async () => {
    const provider = new MockProvider({ invalidToken: true });
    await expect(provider.listSites()).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it('rateLimitRetryAfter propagates RateLimitError with retryAfterSeconds', async () => {
    const provider = new MockProvider({ rateLimitRetryAfter: 60 });
    await expect(provider.listSites()).rejects.toMatchObject({
      name: 'RateLimitError',
      retryAfterSeconds: 60,
    });
    await expect(provider.listSites()).rejects.toBeInstanceOf(RateLimitError);
  });

  it('deployPlugin throws DomainNotOwnedError when domain not in owned list', async () => {
    const provider = new MockProvider({
      sites: [{ domain: 'zerohum.com.br', is_wordpress: true }],
    });
    const promise = provider.deployPlugin({
      domain: 'evil.com',
      slug: 'gtm4wp-mentoria',
      pluginPath: '/app/plugins/gtm4wp-mentoria',
    });
    await expect(promise).rejects.toBeInstanceOf(DomainNotOwnedError);
    await expect(promise).rejects.toMatchObject({ domain: 'evil.com' });
  });

  it('deployPlugin success path returns status=success + summary 12 successful', async () => {
    const provider = new MockProvider();
    const result = await provider.deployPlugin({
      domain: 'mock-site.test',
      slug: 'gtm4wp-mentoria',
      pluginPath: '/app/plugins/gtm4wp-mentoria',
    });
    expect(result.status).toBe('success');
    expect(result.summary?.successful).toBe(12);
  });
});

// Type-only assertion — fails tsc se MockProvider ou HostingerAdapter sair
// fora do contrato IHostingProvider.
const _h: IHostingProvider = new HostingerAdapter({ token: 'x' });
const _m: IHostingProvider = new MockProvider();
void _h;
void _m;
