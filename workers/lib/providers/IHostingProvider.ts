/**
 * `IHostingProvider` — adapter pattern Strategy contract pra provedores de
 * hospedagem WordPress. Espelha ERP `IIntegrationBridge` (ADR-0011).
 *
 * 4 métodos canônicos no MVP-F: `listSites`, `verifyDomain`, `deployPlugin`,
 * `pingToken`. Adições futuras = breaking change ADR.
 *
 * Implementações MVP-F:
 * - `HostingerAdapter` (stub aqui, F-S04 implementa via Hostinger MCP).
 * - `MockProvider` (impl in-memory determinística pra unit tests downstream).
 *
 * Onda 2: `WPRestAdapter` (REST API genérico, qualquer host WP).
 *
 * @see docs/adr-0008-auto-provisioner-gtm-architecture.md §3.3
 * @see docs/specs/F-S03-provider-interface-spec.md
 */

export interface IHostingProvider {
  /**
   * Lista sites WP geridos pela conta autenticada pelo token.
   * @throws {TokenInvalidError} token rejeitado pelo provider
   * @throws {RateLimitError} se MCP retornar 429
   * @throws {ProviderError} qualquer outra falha upstream
   */
  listSites(): Promise<Site[]>;

  /**
   * Verifica se o domínio dado pertence à conta autenticada.
   * Anti-takeover guard. Retorna boolean — NÃO throw quando domínio não
   * pertence (apenas false).
   * @throws {TokenInvalidError} se token rejeitado
   */
  verifyDomain(domain: string): Promise<boolean>;

  /**
   * Deploya plugin GTM4WP no site alvo. Caller garante que domain está em
   * listSites() antes (idealmente via verifyDomain).
   * @throws {DomainNotOwnedError} se domínio não pertence à conta
   * @throws {TokenInvalidError} se token rejeitado
   * @throws {ProviderError} falha de upload / extração
   */
  deployPlugin(opts: DeployPluginOpts): Promise<DeployResult>;

  /**
   * Healthcheck barato de credencial. Retorna boolean — NÃO throw.
   * Usado pelo endpoint F-S05 antes de persistir conta no storage.
   */
  pingToken(): Promise<boolean>;
}

export interface Site {
  domain: string;                  // "zerohum.com.br" (sem protocolo)
  wp_version?: string;             // "6.5.3" se detectado
  php_version?: string;            // "8.2"
  ttfb_ms?: number;                // smoke health
  is_wordpress: boolean;           // false se MCP detecta não-WP
}

export interface DeployPluginOpts {
  domain: string;                  // alvo (precisa estar em listSites())
  slug: string;                    // "gtm4wp-mentoria"
  pluginPath: string;              // path absoluto local container, ex "/app/plugins/gtm4wp-mentoria"
}

export interface DeployResult {
  status: 'success' | 'partial' | 'failed';
  summary?: { successful: number; failed: number };  // file counts
  uploadDirName?: string;          // "gtm4wp-mentoria-aB3kZ9pQ"
  errorSummary?: string;           // truncated 500 chars
}

export type ProviderType = 'hostinger' | 'wp_rest';
