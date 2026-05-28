/**
 * `HostingerAdapter` — IHostingProvider impl real para Hostinger.
 *
 * Source-of-truth: ADR-0008 §3.1 (MCP semantics + random suffix caveat),
 * §3.3 (provider adapter pattern), §3.9 (retry policy).
 *
 * ## Decisão de transporte: REST direto via `fetch` (não MCP server)
 *
 * O Hostinger MCP server só roda em contexto Claude/cliente — o `tracking-api`
 * Hono Node em Easypanel KV8 NÃO tem acesso ao MCP runtime. A story F-S04
 * (Tech Notes linha 99) autoriza explicitamente fallback REST direto:
 * `fetch('https://api.hostinger.com/api/hosting/v1/...', { headers: {
 * Authorization: 'Bearer ' + token } })`. Endpoints públicos confirmed.
 *
 * Endpoints REST relevantes:
 *  - `GET /api/hosting/v1/websites` — list websites (paginated)
 *  - `POST /api/hosting/v1/websites/{domain}/deploy/wordpress-plugin`
 *    — deploy plugin (payload `{ slug, pluginPath }`)
 *  - `pingToken` = `GET /api/hosting/v1/websites?page=1&per_page=1`
 *
 * TODO F-S04 SP-1 followup: se algum endpoint não bater 100% com a API real
 * (a API pública Hostinger é parcialmente undocumented fora do MCP source),
 * Diego ajusta após smoke test F-S14.
 *
 * ## Caveat random suffix (ADR-0008 §3.1)
 *
 * `deployPlugin` retorna `uploadDirName` com suffix random 8-char (server-side):
 * mesmo slug `gtm4wp-mentoria` vira `gtm4wp-mentoria-aB3kZ9pQ` na 1ª e
 * `gtm4wp-mentoria-Xm7sJ2nL` na 2ª. Idempotência mora no NOSSO storage
 * (`tracking.gtm_installations` per F-S01 RedisGtmStorage), NÃO no
 * filesystem. Cleanup de orphans é Onda 1.5 (F-S15 runbook).
 *
 * ## Audit logging (ADR-0008 §3.7 + F-S07)
 *
 * Cada retry attempt + final result chamam `appendAuditWithSanitization(...)` se
 * `storage` + `installationId` + `tenantId` fornecidos no constructor.
 * Wrapper aplica whitelist (7 keys ADR-0008 §3.7) + blacklist regex —
 * LGPD-safe by default (tokens/passwords removidos silenciosamente mesmo
 * se caller construir payload com keys sensíveis por engano). Raw response
 * Hostinger fica em Docker stdout 7d retention.
 *
 * @see docs/adr-0008-auto-provisioner-gtm-architecture.md §3.1, §3.3, §3.7, §3.9
 * @see docs/stories/F-S04.md
 * @see docs/stories/F-S07.md
 */

import type {
  DeployPluginOpts,
  DeployResult,
  IHostingProvider,
  Site,
} from './IHostingProvider';
import {
  DomainNotOwnedError,
  ProviderError,
  RateLimitError,
  TokenInvalidError,
} from './errors';
import type { IGtmStorage, InstallationId, TenantId } from '../storage';
import { withRetry } from '../retry';
import { appendAuditWithSanitization } from '../audit';

// FIX 2026-05-27 (F-S14 smoke real): api.hostinger.com retorna HTTP 530
// (Cloudflare 1016 — origin DNS error). URL correta é developers.hostinger.com.
// Reproduzido via curl direto:
//   GET https://api.hostinger.com/...     → 530
//   GET https://developers.hostinger.com/api/hosting/v1/websites → 401 Unauthenticated (correto)
const HOSTINGER_API_BASE = 'https://developers.hostinger.com/api/hosting/v1';
const LIST_SITES_CACHE_TTL_MS = 60_000;
const LIST_SITES_PAGE_SIZE = 100;
const LIST_SITES_MAX_SITES = 100; // MVP Diego tem <20 sites (F-S04 AC-1)

/**
 * Per-request timeout via AbortSignal.timeout (Codex adversarial #4 fix,
 * 2026-05-27). Antes os fetch eram sem timeout — request hanging podia
 * passar dos 180s do deploy lock e gerar deploy concorrente em outra
 * sessão. Cálculo do teto:
 *   3 attempts × 50s + backoff [1s, 2s, 4s] = 157s ≤ 180s (lock TTL)
 * Hostinger normal responde em <30s, então 50s é folga generosa.
 */
const FETCH_TIMEOUT_MS = 50_000;

export interface HostingerAdapterOpts {
  /** Token Hostinger API (Bearer). Já decifrado pelo caller (F-S05 sealDecrypt). */
  token: string;
  /** Senha admin WP opcional (não usada por este adapter; reservado pra ativação F-S05). */
  wpAdminPassword?: string;
  /** Storage opcional pra audit log. Se ausente, audit é no-op. */
  storage?: IGtmStorage;
  /** Installation alvo (necessário se `storage` fornecido pra appendAudit). */
  installationId?: InstallationId;
  /** Tenant alvo (necessário se `storage` fornecido — denormalizado pra RLS futuro). */
  tenantId?: TenantId;
}

/**
 * Erro estruturado interno pra mapping de HTTP status → classes errors.ts.
 * Carrega `statusCode` pra default isRetryable(err) do withRetry detectar
 * 5xx vs 4xx fail-fast.
 */
class HostingerHttpError extends Error {
  readonly statusCode: number;
  readonly retryAfterSeconds?: number;
  readonly body?: unknown;

  constructor(statusCode: number, message: string, opts?: { retryAfterSeconds?: number; body?: unknown }) {
    super(message);
    this.name = 'HostingerHttpError';
    this.statusCode = statusCode;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
    this.body = opts?.body;
  }
}

interface HostingerWebsiteRaw {
  domain?: string;
  php_version?: string;
  wp_version?: string;
  is_wordpress?: boolean;
  cms?: string; // ex "wordpress"
  [k: string]: unknown;
}

interface HostingerListResponse {
  data?: HostingerWebsiteRaw[];
  // Possível shape alt: response retorna array bare; tratamos ambos.
  meta?: { current_page?: number; total?: number };
  [k: string]: unknown;
}

interface HostingerDeployResponse {
  status?: string;
  summary?: { successful?: number; failed?: number; total?: number };
  uploadDirName?: string;
  upload_dir_name?: string; // snake_case alt
  error?: string;
  results?: unknown;
  [k: string]: unknown;
}

export class HostingerAdapter implements IHostingProvider {
  private readonly token: string;
  private readonly wpAdminPassword?: string;
  private readonly storage?: IGtmStorage;
  private readonly installationId?: InstallationId;
  private readonly tenantId?: TenantId;

  /** Cache TTL pra listSites() — evita N chamadas redundantes em mesmo flow. */
  private listSitesCache?: { sites: Site[]; expiresAt: number };

  constructor(opts: HostingerAdapterOpts) {
    this.token = opts.token;
    this.wpAdminPassword = opts.wpAdminPassword;
    this.storage = opts.storage;
    this.installationId = opts.installationId;
    this.tenantId = opts.tenantId;
    void this.wpAdminPassword; // reservado F-S05 ativação
  }

  /**
   * AC-1: Lista sites WP da conta autenticada. Normaliza pra `Site[]`.
   * Paginação até último page OU 100 sites (whichever first; MVP <20).
   */
  async listSites(): Promise<Site[]> {
    // Cache hit
    if (this.listSitesCache && this.listSitesCache.expiresAt > Date.now()) {
      return this.listSitesCache.sites;
    }

    const sites: Site[] = [];
    let page = 1;

    try {
      while (sites.length < LIST_SITES_MAX_SITES) {
        const url = new URL(`${HOSTINGER_API_BASE}/websites`);
        url.searchParams.set('page', String(page));
        url.searchParams.set('per_page', String(LIST_SITES_PAGE_SIZE));

        const resp = await this.fetchJson<HostingerListResponse | HostingerWebsiteRaw[]>(
          url.toString(),
          { method: 'GET' },
        );

        const rawList = Array.isArray(resp) ? resp : (resp.data ?? []);
        if (rawList.length === 0) break;

        for (const raw of rawList) {
          if (sites.length >= LIST_SITES_MAX_SITES) break;
          sites.push(this.normalizeSite(raw));
        }

        // Stop se retornou menos que page size (= último page)
        if (rawList.length < LIST_SITES_PAGE_SIZE) break;
        page++;
      }
    } catch (err) {
      // Mapeia 401 → TokenInvalidError, 429 → RateLimitError, resto → ProviderError
      throw this.mapError(err);
    }

    this.listSitesCache = {
      sites,
      expiresAt: Date.now() + LIST_SITES_CACHE_TTL_MS,
    };

    return sites;
  }

  /**
   * AC-2: Verifica se domain pertence à conta. Usa cache de listSites().
   */
  async verifyDomain(domain: string): Promise<boolean> {
    const sites = await this.listSites();
    return sites.some((s) => s.domain === domain);
  }

  /**
   * AC-3 + AC-5 + AC-6: Deploya plugin com retry + audit log.
   *
   * Caller (F-S05) garante que `opts.domain` está em listSites() ANTES via
   * `verifyDomain()`. Defesa em profundidade: 403 do Hostinger → DomainNotOwnedError.
   */
  async deployPlugin(opts: DeployPluginOpts): Promise<DeployResult> {
    const url =
      `${HOSTINGER_API_BASE}/websites/${encodeURIComponent(opts.domain)}` +
      `/deploy/wordpress-plugin`;

    const startedAt = Date.now();

    const doRequest = async (): Promise<HostingerDeployResponse> => {
      const attemptStartedAt = Date.now();
      try {
        return await this.fetchJson<HostingerDeployResponse>(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: opts.slug,
            pluginPath: opts.pluginPath,
          }),
        });
      } catch (err) {
        // 403 from Hostinger no deploy = domain mismatch (defense in depth)
        if (err instanceof HostingerHttpError && err.statusCode === 403) {
          throw new DomainNotOwnedError(opts.domain);
        }
        throw err;
      } finally {
        // Log timing per attempt (Easypanel stdout 7d retention; ADR-0008 §3.7)
        const timing = Date.now() - attemptStartedAt;
        this.logStructured({
          event: 'deploy_plugin_attempt',
          domain: opts.domain,
          slug: opts.slug,
          timing_ms: timing,
        });
      }
    };

    let raw: HostingerDeployResponse;
    try {
      raw = await withRetry(doRequest, {
        attempts: 3,
        backoff: [1000, 2000, 4000],
        onRetry: async (err, attemptNumber) => {
          // AC-6: audit cada retry attempt (não o initial).
          // Payload usa só keys whitelist (F-S07 sanitization).
          await this.safeAppendAudit({
            action: 'upload_started',
            payload: {
              retry_attempt: attemptNumber,
              status_code: this.extractStatusCode(err),
              timing_ms: Date.now() - startedAt,
              site_domain: opts.domain,
            },
          });
        },
      });
    } catch (err) {
      // Final failure → audit + mapeia pra ProviderError hierarchy.
      // Payload usa só keys whitelist (F-S07 sanitization).
      await this.safeAppendAudit({
        action: 'upload_failed',
        payload: {
          status_code: this.extractStatusCode(err),
          timing_ms: Date.now() - startedAt,
          site_domain: opts.domain,
          error_summary: this.truncate(this.errorMessage(err), 500),
        },
      });
      throw this.mapError(err, opts.domain);
    }

    const summary = raw.summary ?? {};
    const successful = Number(summary.successful ?? 0);
    const failed = Number(summary.failed ?? 0);

    let status: DeployResult['status'];
    if (failed === 0 && successful > 0) status = 'success';
    else if (failed > 0 && successful > 0) status = 'partial';
    else status = 'failed';

    const uploadDirName =
      raw.uploadDirName ?? raw.upload_dir_name ?? undefined;

    const result: DeployResult = {
      status,
      summary: { successful, failed },
      uploadDirName,
      errorSummary: raw.error ? this.truncate(String(raw.error), 500) : undefined,
    };

    // AC-6: audit final result.
    // Payload usa só keys whitelist (F-S07 sanitization). file_count agrega
    // successful + failed; detalhes ricos vivem em DeployResult.summary que
    // o caller (deployJob) tem em mãos.
    await this.safeAppendAudit({
      action: status === 'failed' ? 'upload_failed' : 'upload_complete',
      payload: {
        status_code: 200,
        timing_ms: Date.now() - startedAt,
        site_domain: opts.domain,
        upload_dir_name: uploadDirName,
        file_count: successful + failed,
      },
    });

    return result;
  }

  /**
   * AC-4: Healthcheck token. 200 → true, 401 → false (sem throw), 5xx/network → throw.
   */
  async pingToken(): Promise<boolean> {
    const url = `${HOSTINGER_API_BASE}/websites?page=1&per_page=1`;
    try {
      await this.fetchJson<unknown>(url, { method: 'GET' });
      return true;
    } catch (err) {
      if (err instanceof HostingerHttpError && err.statusCode === 401) {
        return false;
      }
      // 5xx / network / outros 4xx → propaga (caller decide)
      throw this.mapError(err);
    }
  }

  // ===== privates =====

  private normalizeSite(raw: HostingerWebsiteRaw): Site {
    const isWp =
      raw.is_wordpress === true ||
      (typeof raw.cms === 'string' && raw.cms.toLowerCase() === 'wordpress') ||
      typeof raw.wp_version === 'string';

    return {
      domain: String(raw.domain ?? ''),
      wp_version: typeof raw.wp_version === 'string' ? raw.wp_version : undefined,
      php_version: typeof raw.php_version === 'string' ? raw.php_version : undefined,
      is_wordpress: isWp,
    };
  }

  /**
   * Wrapper fetch que normaliza errors em HostingerHttpError (carries statusCode
   * pro withRetry default isRetryable detectar 5xx vs 4xx).
   *
   * Codex #4 fix (2026-05-27): força `AbortSignal.timeout(FETCH_TIMEOUT_MS)`
   * por attempt. Se caller passar `init.signal`, combina via
   * `AbortSignal.any([caller, timeout])` (Node 20+). Sem caller signal,
   * usa o timeout sozinho. AbortError vira erro genérico que `withRetry`
   * vai re-tentar (5xx-like), e ProviderError no terminal failure.
   */
  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/json');

    // Combina caller signal (opcional) com timeout per-request (sempre).
    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    let resp: Response;
    try {
      resp = await fetch(url, { ...init, headers, signal });
    } catch (err) {
      // Network error (undici) OU AbortError (timeout/caller cancel): preserva
      // pro isRetryable detectar. AbortError com `name: 'TimeoutError'` vem
      // do AbortSignal.timeout — withRetry retenta como 5xx-like.
      throw err;
    }

    if (!resp.ok) {
      let body: unknown;
      try {
        const text = await resp.text();
        body = text ? (this.tryJson(text) ?? text) : undefined;
      } catch {
        body = undefined;
      }
      const retryAfter = resp.headers.get('Retry-After');
      throw new HostingerHttpError(
        resp.status,
        `Hostinger API ${resp.status} ${resp.statusText}`,
        {
          retryAfterSeconds: retryAfter ? Number(retryAfter) || undefined : undefined,
          body,
        },
      );
    }

    // Sucesso: parse JSON (204 no-content tolerado)
    if (resp.status === 204) return undefined as T;
    const text = await resp.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private tryJson(text: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /** Mapeia err interno → classes em `errors.ts` per F-S04 spec. */
  private mapError(err: unknown, domain?: string): Error {
    if (err instanceof ProviderError) return err;
    if (err instanceof HostingerHttpError) {
      if (err.statusCode === 401) {
        return new TokenInvalidError('Hostinger token rejected (401)', err);
      }
      if (err.statusCode === 429) {
        return new RateLimitError(err.retryAfterSeconds, err);
      }
      if (err.statusCode === 403 && domain) {
        return new DomainNotOwnedError(domain);
      }
      return new ProviderError(err.message, err);
    }
    return new ProviderError(this.errorMessage(err), err);
  }

  private extractStatusCode(err: unknown): number | undefined {
    if (err instanceof HostingerHttpError) return err.statusCode;
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const sc = (err as { statusCode?: unknown }).statusCode;
      if (typeof sc === 'number') return sc;
    }
    return undefined;
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) : s;
  }

  /**
   * Audit log graceful: no-op se storage / installationId / tenantId ausentes.
   * Erros do storage NÃO propagam — audit é best-effort.
   *
   * Usa `appendAuditWithSanitization` (F-S07) pra garantir LGPD-safe payload
   * — tokens/passwords/secrets removidos via blacklist regex mesmo se algum
   * caller construir payload com keys sensíveis por engano.
   */
  private async safeAppendAudit(input: {
    action: Parameters<IGtmStorage['appendAudit']>[0]['action'];
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (!this.storage || !this.installationId || !this.tenantId) return;
    try {
      await appendAuditWithSanitization(this.storage, {
        installation_id: this.installationId,
        tenant_id: this.tenantId,
        action: input.action,
        rawPayload: input.payload,
        actor_source: 'tracking-api',
      });
    } catch (err) {
      // Audit failure não derruba deploy. Log stdout pra forensics.
      this.logStructured({
        event: 'audit_append_failed',
        error: this.errorMessage(err),
      });
    }
  }

  /** Structured JSON log → Easypanel stdout (ADR-0008 §3.7, 7d retention). */
  private logStructured(payload: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ source: 'HostingerAdapter', ...payload }));
  }
}
