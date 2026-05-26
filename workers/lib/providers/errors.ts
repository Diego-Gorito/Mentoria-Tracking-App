/**
 * Provider error hierarchy — F-S05 middleware Hono mapa cada subclasse pra
 * HTTP status apropriado declarativamente via `err.statusCode`.
 *
 * Convenção: cada subclass seta `this.name = '<ClassName>'` pra logs
 * estruturados (Hono logger captura `err.name`). `cause` opcional preserva
 * error upstream original (MCP SDK error) sem perder stack.
 *
 * @see docs/specs/F-S03-provider-interface-spec.md §5
 */

/**
 * Base class — provider invariant violation. Inclui statusCode pra middleware
 * Hono fazer map declarativo: ProviderError.statusCode ?? 502.
 */
export class ProviderError extends Error {
  readonly statusCode: number = 502;
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ProviderError';
    this.cause = cause;
  }
}

/**
 * Token rejeitado pelo provider (401/403 upstream).
 * Middleware F-S05 → HTTP 401 com body { error: 'invalid_token' }.
 */
export class TokenInvalidError extends ProviderError {
  readonly statusCode = 401;
  constructor(message = 'Token rejected by provider', cause?: unknown) {
    super(message, cause);
    this.name = 'TokenInvalidError';
  }
}

/**
 * Rate limit upstream (429). Contém retryAfterSeconds quando provider expõe.
 * Middleware F-S05 → HTTP 429 com header Retry-After.
 */
export class RateLimitError extends ProviderError {
  readonly statusCode = 429;
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number, cause?: unknown) {
    super('Provider rate limit exceeded', cause);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Anti-takeover guard: domínio passado pelo usuário NÃO está em listSites().
 * Middleware F-S05 → HTTP 403 com body { error: 'domain_not_owned', domain }.
 */
export class DomainNotOwnedError extends ProviderError {
  readonly statusCode = 403;
  readonly domain: string;

  constructor(domain: string) {
    super(`Domain "${domain}" not owned by authenticated account`);
    this.name = 'DomainNotOwnedError';
    this.domain = domain;
  }
}
