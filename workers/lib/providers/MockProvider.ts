/**
 * `MockProvider` — implementação in-memory determinística pra unit tests
 * downstream (F-S05+ endpoints). Comportamento configurável via constructor
 * opts pra simular happy path, token invalid, rate limit, e domain mismatch.
 *
 * NÃO re-exportar de `index.ts` — só consumível por `__tests__/`.
 *
 * @see docs/specs/F-S03-provider-interface-spec.md §7
 */

import type { DeployPluginOpts, DeployResult, IHostingProvider, Site } from './IHostingProvider';
import { DomainNotOwnedError, RateLimitError, TokenInvalidError } from './errors';

export interface MockProviderOpts {
  /** Sites que listSites() retorna. Default: array com 1 site fake. */
  sites?: Site[];
  /** Domínios que verifyDomain() retorna true. Default: extraído de sites[]. */
  ownedDomains?: string[];
  /** Se true, todos os métodos lançam TokenInvalidError. Default: false. */
  invalidToken?: boolean;
  /** Se setado, lança RateLimitError(retryAfter). Default: undefined. */
  rateLimitRetryAfter?: number;
  /** Override do retorno de deployPlugin. Default: { status: 'success', ... }. */
  deployResult?: DeployResult;
  /** Override do retorno de pingToken. Default: !invalidToken. */
  pingResult?: boolean;
}

const DEFAULT_FAKE_SITE: Site = {
  domain: 'mock-site.test',
  wp_version: '6.5.3',
  php_version: '8.2',
  ttfb_ms: 120,
  is_wordpress: true,
};

export class MockProvider implements IHostingProvider {
  private readonly opts: MockProviderOpts;

  constructor(opts: MockProviderOpts = {}) {
    this.opts = opts;
  }

  async listSites(): Promise<Site[]> {
    if (this.opts.invalidToken) throw new TokenInvalidError();
    if (this.opts.rateLimitRetryAfter !== undefined) {
      throw new RateLimitError(this.opts.rateLimitRetryAfter);
    }
    return this.opts.sites ?? [DEFAULT_FAKE_SITE];
  }

  async verifyDomain(domain: string): Promise<boolean> {
    if (this.opts.invalidToken) throw new TokenInvalidError();
    const owned = this.opts.ownedDomains
      ?? (this.opts.sites ?? [DEFAULT_FAKE_SITE]).map((s) => s.domain);
    return owned.includes(domain);
  }

  async deployPlugin(opts: DeployPluginOpts): Promise<DeployResult> {
    if (this.opts.invalidToken) throw new TokenInvalidError();
    const owned = await this.verifyDomain(opts.domain);
    if (!owned) throw new DomainNotOwnedError(opts.domain);
    return this.opts.deployResult ?? {
      status: 'success',
      summary: { successful: 12, failed: 0 },
      uploadDirName: `${opts.slug}-mock${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  async pingToken(): Promise<boolean> {
    if (this.opts.rateLimitRetryAfter !== undefined) {
      throw new RateLimitError(this.opts.rateLimitRetryAfter);
    }
    return this.opts.pingResult ?? !this.opts.invalidToken;
  }
}
