/**
 * HTTP-layer error classes — F-S05 endpoints.
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-6 (LockConflictError) + AC-10
 * (error shape com `code` UPPER_SNAKE PT-BR).
 *
 * Convenção: cada subclasse seta `statusCode` numérico + `code` UPPER_SNAKE
 * pra o errorHandler central serializar declarativamente. Erros de provider
 * (ProviderError, TokenInvalidError, RateLimitError, DomainNotOwnedError) já
 * existem em `workers/lib/providers/errors.ts` e são mapeados separadamente
 * no errorHandler.
 */

/**
 * Base class — qualquer erro com `statusCode` HTTP + `code` UPPER_SNAKE.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * 409 — lock distribuído já adquirido por outro deploy.
 * F-S05 AC-6: storage.acquireLock retornou false.
 */
export class LockConflictError extends HttpError {
  constructor(message = 'Outro deploy em andamento pra esse site') {
    super(409, 'DEPLOY_IN_PROGRESS', message);
    this.name = 'LockConflictError';
  }
}

/**
 * 404 — recurso não encontrado (account/installation por id).
 */
export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} ${id} não encontrado`);
    this.name = 'NotFoundError';
  }
}
