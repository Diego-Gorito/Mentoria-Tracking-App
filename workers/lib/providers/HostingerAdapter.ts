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
 * `fetch('https://developers.hostinger.com/api/hosting/v1/...', { headers: {
 * Authorization: 'Bearer ' + token } })`. Endpoints públicos confirmed.
 *
 * Endpoints REST relevantes:
 *  - `GET /api/hosting/v1/websites` — list websites (paginated)
 *  - `GET /api/hosting/v1/websites?domain=X` — resolve username from domain (F-S14 #2)
 *  - `POST /api/hosting/v1/files/upload-urls` — get TUS upload credentials (F-S14 #2)
 *  - `pingToken` = `GET /api/hosting/v1/websites?page=1&per_page=1`
 *
 * ## Plugin upload protocol (F-S14 #2 fix 2026-05-28)
 *
 * O endpoint hipotético `POST /websites/{domain}/deploy/wordpress-plugin`
 * NÃO EXISTE — retorna 404. Smoke F-S14 isolou que o protocolo real é
 * **TUS upload arquivo-por-arquivo** via servidor de files separado:
 *
 *  1. `GET /websites?domain=ifrn.com.br` → resolve `username` (ex u393832877)
 *  2. `POST /files/upload-urls` `{username, domain}` → retorna
 *     `{uploadUrl, authRestToken, authToken}`. `uploadUrl` aponta pra
 *     `https://srv<N>-files.hstgr.io/rest/<token>/api/tus/public_html`
 *  3. Pra cada arquivo do pluginPath:
 *     a. Pre-upload `POST {uploadUrl}/wp-content/plugins/{dir}/{relPath}?override=true`
 *        com `X-Auth`, `X-Auth-Rest`, `upload-length: <bytes>`, `upload-offset: 0`,
 *        body vazio → 201 Created
 *     b. TUS PATCH no mesmo URL com `Upload-Offset: 0`,
 *        `Content-Type: application/offset+octet-stream`,
 *        `Tus-Resumable: 1.0.0`, body = bytes → 204 No Content
 *
 * `uploadDirName` é gerado client-side como `{slug}-{rand8}` pra evitar
 * conflito de plugin folders. WordPress detecta plugin por Plugin Name
 * no PHP, então o suffix só afeta filesystem path (caveat ADR-0008 §3.1).
 *
 * Reference: hostinger/api-mcp-server src/core/runtime.ts (handleWordpressPluginDeploy).
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

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, posix, relative } from 'node:path';
import { randomBytes } from 'node:crypto';

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

/** Credenciais TUS retornadas por POST /files/upload-urls. */
interface TusCredentials {
  /** Base URL pro PATCH (ex `https://srv1891-files.hstgr.io/rest/<token>/api/tus/public_html`). */
  uploadUrl: string;
  /** Token de auth principal. Vai em header `X-Auth`. */
  authToken: string;
  /** Token REST extra. Vai em header `X-Auth-Rest`. */
  authRestToken: string;
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
   * AC-3 + AC-5 + AC-6: Deploya plugin via TUS upload arquivo-por-arquivo.
   *
   * Pipeline (F-S14 #2 — 2026-05-28):
   *   1. resolveUsername(domain) — GET /websites?domain
   *   2. fetchUploadCredentials(username, domain) — POST /files/upload-urls
   *   3. walkPluginFiles(pluginPath) — lista files recursivos
   *   4. uploadDirName = `{slug}-{rand8}` (server-side suffix removido — geramos)
   *   5. pra cada file: pre-upload POST + TUS PATCH (1 chunk)
   *
   * Retry envolve TODA a operação de upload (3 tentativas, backoff exponencial).
   * Audit logging per attempt + final result (AC-6).
   *
   * Caller (F-S05) garante que `opts.domain` está em listSites() ANTES via
   * `verifyDomain()`. Defesa em profundidade: 403 do Hostinger → DomainNotOwnedError.
   */
  async deployPlugin(opts: DeployPluginOpts): Promise<DeployResult> {
    const startedAt = Date.now();
    const uploadDirName = `${opts.slug}-${this.generateRandomSuffix(8)}`;

    const doUpload = async (): Promise<{ successful: number; failed: number }> => {
      const attemptStartedAt = Date.now();
      try {
        // Step 1: resolve username from domain
        const username = await this.resolveUsername(opts.domain);

        // Step 2: fetch upload credentials (TUS server URL + tokens)
        const creds = await this.fetchUploadCredentials(username, opts.domain);

        // Step 3: walk pluginPath recursive
        const files = await this.walkPluginFiles(opts.pluginPath);
        if (files.length === 0) {
          throw new Error(`No files found in pluginPath: ${opts.pluginPath}`);
        }

        // Step 4 + 5: per-file pre-upload + TUS PATCH
        let successful = 0;
        let failed = 0;
        for (const absPath of files) {
          // relPath relativo ao pluginPath, normalizado pra forward slashes
          const relPath = relative(opts.pluginPath, absPath).split(/[\\/]/).join('/');
          const remotePath = posix.join('wp-content/plugins', uploadDirName, relPath);
          try {
            await this.uploadFileTus(absPath, remotePath, creds);
            successful++;
          } catch (err) {
            failed++;
            this.logStructured({
              event: 'tus_upload_file_failed',
              domain: opts.domain,
              file: relPath,
              error: this.errorMessage(err),
            });
            // Continua os demais arquivos. Caller decide se 'partial' OK.
          }
        }

        return { successful, failed };
      } finally {
        const timing = Date.now() - attemptStartedAt;
        this.logStructured({
          event: 'deploy_plugin_attempt',
          domain: opts.domain,
          slug: opts.slug,
          upload_dir_name: uploadDirName,
          timing_ms: timing,
        });
      }
    };

    let counts: { successful: number; failed: number };
    try {
      counts = await withRetry(doUpload, {
        attempts: 3,
        backoff: [1000, 2000, 4000],
        // Não retry quando TODOS arquivos uploaded com sucesso (success path).
        // Retry só nas exceptions (auth/network). Se "partial" (alguns falharam),
        // não retry — deixa caller decidir (Onda 1.5: targeted re-upload dos failed).
        onRetry: async (err, attemptNumber) => {
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
      // 403 from Hostinger = domain mismatch (defense in depth — verifyDomain antes)
      if (err instanceof HostingerHttpError && err.statusCode === 403) {
        await this.safeAppendAudit({
          action: 'upload_failed',
          payload: {
            status_code: 403,
            timing_ms: Date.now() - startedAt,
            site_domain: opts.domain,
            error_summary: 'DomainNotOwnedError',
          },
        });
        throw new DomainNotOwnedError(opts.domain);
      }

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

    let status: DeployResult['status'];
    if (counts.failed === 0 && counts.successful > 0) status = 'success';
    else if (counts.failed > 0 && counts.successful > 0) status = 'partial';
    else status = 'failed';

    const result: DeployResult = {
      status,
      summary: { successful: counts.successful, failed: counts.failed },
      uploadDirName,
      errorSummary: undefined,
    };

    await this.safeAppendAudit({
      action: status === 'failed' ? 'upload_failed' : 'upload_complete',
      payload: {
        status_code: 200,
        timing_ms: Date.now() - startedAt,
        site_domain: opts.domain,
        upload_dir_name: uploadDirName,
        file_count: counts.successful + counts.failed,
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

  // ----- TUS upload helpers (F-S14 #2) -----

  /**
   * Resolve username Hostinger a partir do domain.
   * GET /websites?domain=X → data[0].username.
   * Necessário pra obter upload credentials (próximo step).
   */
  private async resolveUsername(domain: string): Promise<string> {
    const url = new URL(`${HOSTINGER_API_BASE}/websites`);
    url.searchParams.set('domain', domain);

    const resp = await this.fetchJson<HostingerListResponse | HostingerWebsiteRaw[]>(
      url.toString(),
      { method: 'GET' },
    );
    const list = Array.isArray(resp) ? resp : (resp.data ?? []);
    if (list.length === 0) {
      throw new Error(`No website found for domain: ${domain}`);
    }
    const username = (list[0] as { username?: string }).username;
    if (!username || typeof username !== 'string') {
      throw new Error(`username ausente na resposta /websites?domain=${domain}`);
    }
    return username;
  }

  /**
   * Fetch credentials TUS pro upload de files.
   * POST /files/upload-urls com {username, domain} → {uploadUrl, authToken, authRestToken}.
   * `uploadUrl` aponta pra `https://srv<N>-files.hstgr.io/rest/<sessionToken>/api/tus/public_html`.
   */
  private async fetchUploadCredentials(
    username: string,
    domain: string,
  ): Promise<TusCredentials> {
    const url = `${HOSTINGER_API_BASE}/files/upload-urls`;
    const resp = await this.fetchJson<Record<string, unknown>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, domain }),
    });

    // Hostinger API retorna `url`, `auth_key`, `rest_auth_key` (confirmed
    // via smoke F-S14 #3). MCP source documenta `uploadUrl, authToken,
    // authRestToken` (legacy). Aceitamos ambos pra robustez.
    const uploadUrl = String(
      resp.url ?? resp.uploadUrl ?? resp.upload_url ?? '',
    );
    const authToken = String(
      resp.auth_key ?? resp.authToken ?? resp.auth_token ?? '',
    );
    const authRestToken = String(
      resp.rest_auth_key ?? resp.authRestToken ?? resp.auth_rest_token ?? '',
    );

    if (!uploadUrl || !authToken || !authRestToken) {
      throw new Error(
        `upload-urls response missing credentials: keys=${Object.keys(resp).join(',')}`,
      );
    }
    return { uploadUrl, authToken, authRestToken };
  }

  /**
   * Walk recursivo do pluginPath, retornando paths absolutos de TODOS os arquivos
   * (não dirs). Ordem determinística (sort) — facilita debug e idempotência audit.
   */
  private async walkPluginFiles(pluginPath: string): Promise<string[]> {
    const out: string[] = [];

    const recurse = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      // Ordem determinística
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await recurse(full);
        } else if (entry.isFile()) {
          out.push(full);
        }
        // symlinks/socket/etc ignorados
      }
    };

    const rootStat = await stat(pluginPath);
    if (!rootStat.isDirectory()) {
      throw new Error(`pluginPath não é diretório: ${pluginPath}`);
    }
    await recurse(pluginPath);
    return out;
  }

  /**
   * Upload TUS de 1 arquivo. Como plugin gtm4wp-mentoria tem arquivos pequenos
   * (<10MB), uploadamos em 1 chunk (sem resumable). Protocolo:
   *
   *   1. POST {uploadUrl}/{remotePath}?override=true
   *      Headers: X-Auth, X-Auth-Rest, upload-length: <size>, upload-offset: 0
   *      Body: '' (vazio)
   *      → 201 Created (resource criado)
   *
   *   2. PATCH mesmo URL
   *      Headers: X-Auth, X-Auth-Rest, Tus-Resumable: 1.0.0,
   *               Upload-Offset: 0, Content-Type: application/offset+octet-stream
   *      Body: file bytes
   *      → 204 No Content (upload finalizado)
   */
  private async uploadFileTus(
    absPath: string,
    remotePath: string,
    creds: TusCredentials,
  ): Promise<void> {
    const buf = await readFile(absPath);
    const size = buf.byteLength;

    const cleanUrl = creds.uploadUrl.replace(/\/$/, '');
    const target = `${cleanUrl}/${remotePath}?override=true`;

    const baseHeaders: Record<string, string> = {
      'X-Auth': creds.authToken,
      'X-Auth-Rest': creds.authRestToken,
    };

    // 1. Pre-upload POST (create resource)
    const createResp = await this.tusRequest(target, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Upload-Length': String(size),
        'Upload-Offset': '0',
        'Tus-Resumable': '1.0.0',
      },
      body: '',
    });
    if (createResp.status !== 201) {
      const text = await this.safeReadText(createResp);
      throw new HostingerHttpError(
        createResp.status,
        `TUS pre-upload POST falhou (${createResp.status}): ${this.truncate(text, 200)}`,
        { body: text },
      );
    }

    // 2. PATCH upload bytes
    const patchResp = await this.tusRequest(target, {
      method: 'PATCH',
      headers: {
        ...baseHeaders,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
      },
      // Buffer é compatível com fetch body no Node 22 (sem DOM lib em tsconfig)
      body: buf as unknown as ArrayBuffer,
    });
    if (patchResp.status !== 204 && patchResp.status !== 200) {
      const text = await this.safeReadText(patchResp);
      throw new HostingerHttpError(
        patchResp.status,
        `TUS PATCH falhou (${patchResp.status}): ${this.truncate(text, 200)}`,
        { body: text },
      );
    }
  }

  /** Wrapper fetch p/ TUS (NÃO seta Bearer — TUS usa X-Auth headers próprios). */
  private async tusRequest(
    url: string,
    init: { method: string; headers: Record<string, string>; body: string | ArrayBuffer | Buffer },
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: timeoutSignal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new HostingerHttpError(
          0,
          `TUS request timeout após ${FETCH_TIMEOUT_MS}ms: ${url}`,
        );
      }
      throw err;
    }
  }

  private async safeReadText(resp: Response): Promise<string> {
    try {
      return await resp.text();
    } catch {
      return '';
    }
  }

  /** Random 8 chars base64-url-safe (sem `+`, `/`, `=`). Match MCP semantics. */
  private generateRandomSuffix(length: number): string {
    return randomBytes(length)
      .toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, length);
  }

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

    // Network error (undici) OU AbortError (timeout/caller cancel) propagam
    // direto pro withRetry — AbortError com `name: 'TimeoutError'` vem do
    // AbortSignal.timeout e é retentado como 5xx-like.
    const resp: Response = await fetch(url, { ...init, headers, signal });

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
     
    console.log(JSON.stringify({ source: 'HostingerAdapter', ...payload }));
  }
}
