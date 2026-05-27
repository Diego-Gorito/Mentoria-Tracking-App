/**
 * Errors específicos do GTM API. Mapeam status codes + scenarios pra classes
 * que callers podem distinguir (vs ProviderError genérico).
 *
 * ADR-0009 §6 — riscos R2 (API quebra), R3 (rate limit), R4 (quota 500
 * containers).
 */

/** Erro base — qualquer falha vinda de GTM API. */
export class GtmApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'GtmApiError';
  }
}

/** SA key inválida ou scopes insuficientes (403 PERMISSION_DENIED). */
export class GtmAuthError extends GtmApiError {
  constructor(message: string, responseBody?: unknown) {
    super(message, 403, responseBody);
    this.name = 'GtmAuthError';
  }
}

/** 429 ou 403 RATE_LIMIT_EXCEEDED — backoff então retry. */
export class GtmRateLimitError extends GtmApiError {
  constructor(
    public readonly retryAfterSeconds: number,
    responseBody?: unknown,
  ) {
    super(`GTM rate limit hit, retry after ${retryAfterSeconds}s`, 429, responseBody);
    this.name = 'GtmRateLimitError';
  }
}

/** 403 quotaExceeded — quota diária Google atingida (50k req/day default). */
export class GtmQuotaExceededError extends GtmApiError {
  constructor(responseBody?: unknown) {
    super(
      'GTM daily quota exceeded (50k req/day Service Account). Retry tomorrow.',
      403,
      responseBody,
    );
    this.name = 'GtmQuotaExceededError';
  }
}

/** 404 — container/workspace/entity não existe. */
export class GtmNotFoundError extends GtmApiError {
  constructor(resource: string, responseBody?: unknown) {
    super(`GTM ${resource} not found`, 404, responseBody);
    this.name = 'GtmNotFoundError';
  }
}

/** 409 — conflito (ex: tentativa de criar container que já existe). */
export class GtmConflictError extends GtmApiError {
  constructor(message: string, responseBody?: unknown) {
    super(message, 409, responseBody);
    this.name = 'GtmConflictError';
  }
}

/** Limite 500 containers/conta atingido (espera-se com SA dedicada). */
export class GtmContainerLimitError extends GtmApiError {
  constructor(accountId: string, currentCount: number) {
    super(
      `GTM account ${accountId} hit 500 containers limit (currently ${currentCount}). Create secondary account.`,
      400,
    );
    this.name = 'GtmContainerLimitError';
  }
}

/**
 * Helper: identifica error type pelo response body / status.
 * Usar logo após response.json() em fetch wrappers.
 */
export function classifyGtmError(
  statusCode: number,
  body: unknown,
): GtmApiError {
  const errorObj = (body as { error?: { message?: string; status?: string; details?: unknown[] } })?.error;
  const message = errorObj?.message ?? 'Unknown GTM API error';
  const status = errorObj?.status;

  if (statusCode === 401) return new GtmAuthError(message, body);
  if (statusCode === 403) {
    if (message.toLowerCase().includes('quota')) return new GtmQuotaExceededError(body);
    if (status === 'PERMISSION_DENIED') return new GtmAuthError(message, body);
    if (message.toLowerCase().includes('rate')) {
      return new GtmRateLimitError(60, body);
    }
    return new GtmAuthError(message, body);
  }
  if (statusCode === 404) return new GtmNotFoundError(message, body);
  if (statusCode === 409) return new GtmConflictError(message, body);
  if (statusCode === 429) {
    // Retry-After header já tratado upstream; default 60s
    return new GtmRateLimitError(60, body);
  }
  return new GtmApiError(message, statusCode, body);
}
