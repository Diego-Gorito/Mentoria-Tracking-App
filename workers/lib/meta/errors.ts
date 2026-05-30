/**
 * Erros do Meta Marketing API (Graph API v21.0). Espelha a hierarquia de
 * `workers/lib/providers/errors.ts` (ProviderError) — cada subclass carrega
 * `statusCode` pro errorHandler central mapear declarativamente.
 *
 * Códigos de erro relevantes do Graph API (campo `error.code` no body):
 *   - 190  → token inválido/expirado/revogado (OAuthException) → MetaTokenInvalidError (401)
 *   - 4 / 17 / 32 / 613 → rate limit (application/user/page) → MetaRateLimitError (429)
 *   - 10 / 200..299 → permissão insuficiente (faltam scopes ads_read/ads_management)
 *
 * Ref: https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */

/** Base — qualquer falha vinda do Meta Graph API. statusCode default 502. */
export class MetaApiError extends Error {
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(message: string, statusCode = 502, cause?: unknown) {
    super(message);
    this.name = 'MetaApiError';
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

/**
 * Token System User inválido, expirado ou revogado (Graph error code 190).
 * errorHandler → HTTP 401 INVALID_TOKEN.
 */
export class MetaTokenInvalidError extends MetaApiError {
  constructor(message = 'Token Meta inválido ou expirado', cause?: unknown) {
    super(message, 401, cause);
    this.name = 'MetaTokenInvalidError';
  }
}

/**
 * Rate limit do Graph API (codes 4/17/32/613). errorHandler → HTTP 429.
 * `retryAfterSeconds` quando o header X-App-Usage / Retry-After indica.
 */
export class MetaRateLimitError extends MetaApiError {
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number, cause?: unknown) {
    super('Limite de requisições do Meta atingido', 429, cause);
    this.name = 'MetaRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Token válido mas sem os scopes necessários (ads_read/ads_management).
 * Graph codes 10 ou 200-299. errorHandler → HTTP 403.
 */
export class MetaPermissionError extends MetaApiError {
  constructor(message = 'Token Meta sem permissão (faltam scopes ads_read/ads_management)', cause?: unknown) {
    super(message, 403, cause);
    this.name = 'MetaPermissionError';
  }
}
