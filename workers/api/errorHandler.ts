/**
 * errorHandler — central app.onError handler.
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-10 (error shape padronizado:
 * `{ error: { code, message, request_id } }` + status code declarativo).
 *
 * Hierarquia mapeada:
 * - HttpError (e subclasses: LockConflictError, NotFoundError) → statusCode + code locais
 * - ProviderError (e subclasses TokenInvalidError, RateLimitError, DomainNotOwnedError) → statusCode da classe + code derivado
 * - ZodError → 422 VALIDATION_ERROR (issues no body details)
 * - Erros genéricos → 500 INTERNAL_ERROR (mensagem genérica PT-BR, sem leak)
 *
 * NÃO loga email/PII per LGPD (CLAUDE.md). Loga apenas: requestId, code, status,
 * mensagem técnica truncada.
 */

import type { Context } from 'hono';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';

import {
  DomainNotOwnedError,
  ProviderError,
  RateLimitError,
  TokenInvalidError,
} from '../lib/providers/errors';
import {
  MetaApiError,
  MetaPermissionError,
  MetaRateLimitError,
  MetaTokenInvalidError,
} from '../lib/meta/errors';
import { HttpError } from './errors';
import { getRequestId } from './requestId';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: unknown;
    domain?: string;
  };
}

function makeBody(
  code: string,
  message: string,
  requestId: string,
  extra?: Record<string, unknown>,
): ErrorBody {
  return {
    error: {
      code,
      message,
      request_id: requestId,
      ...(extra ?? {}),
    },
  };
}

export function errorHandler(err: Error, c: Context): Response {
  const requestId = getRequestId(c);

  // 1. HttpError local (LockConflictError, NotFoundError, etc.)
  if (err instanceof HttpError) {
    console.warn(`[api] http_error req=${requestId} code=${err.code} status=${err.statusCode}`);
    return c.json(
      makeBody(err.code, err.message, requestId),
      err.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    );
  }

  // 2. Provider errors (sub-hierarquia em workers/lib/providers/errors.ts)
  if (err instanceof TokenInvalidError) {
    console.warn(`[api] token_invalid req=${requestId}`);
    return c.json(
      makeBody('INVALID_TOKEN', 'Token rejeitado pelo provedor', requestId),
      401,
    );
  }

  if (err instanceof RateLimitError) {
    if (typeof err.retryAfterSeconds === 'number') {
      c.header('Retry-After', String(err.retryAfterSeconds));
    }
    console.warn(`[api] rate_limit req=${requestId} retry_after=${err.retryAfterSeconds ?? 'n/a'}`);
    return c.json(
      makeBody('RATE_LIMITED', 'Limite de requisições do provedor atingido', requestId),
      429,
    );
  }

  if (err instanceof DomainNotOwnedError) {
    console.warn(`[api] domain_not_owned req=${requestId} domain=${err.domain}`);
    return c.json(
      makeBody(
        'DOMAIN_NOT_OWNED',
        `Domínio "${err.domain}" não pertence à conta autenticada`,
        requestId,
        { domain: err.domain },
      ),
      403,
    );
  }

  if (err instanceof ProviderError) {
    console.error(`[api] provider_error req=${requestId} status=${err.statusCode} msg=${err.message.slice(0, 200)}`);
    return c.json(
      makeBody('PROVIDER_ERROR', 'Erro ao falar com o provedor de hospedagem', requestId),
      err.statusCode === 502 ? 502 : (err.statusCode as 400 | 401 | 403 | 404 | 422 | 500 | 502),
    );
  }

  // 2b. Meta Marketing API errors (sub-hierarquia em workers/lib/meta/errors.ts).
  // NUNCA loga o token (já garantido na origem — client não inclui token em msg).
  if (err instanceof MetaTokenInvalidError) {
    console.warn(`[api] meta_token_invalid req=${requestId}`);
    return c.json(
      makeBody('META_TOKEN_INVALID', 'Token Meta inválido ou expirado — gere um novo', requestId),
      401,
    );
  }
  if (err instanceof MetaRateLimitError) {
    if (typeof err.retryAfterSeconds === 'number') {
      c.header('Retry-After', String(err.retryAfterSeconds));
    }
    console.warn(`[api] meta_rate_limit req=${requestId}`);
    return c.json(
      makeBody('META_RATE_LIMITED', 'Limite de requisições do Meta atingido. Tente em alguns minutos.', requestId),
      429,
    );
  }
  if (err instanceof MetaPermissionError) {
    console.warn(`[api] meta_permission req=${requestId}`);
    return c.json(
      makeBody('META_PERMISSION_DENIED', 'Token Meta sem permissão. Confira os scopes ads_read e ads_management.', requestId),
      403,
    );
  }
  if (err instanceof MetaApiError) {
    console.error(`[api] meta_api_error req=${requestId} status=${err.statusCode} msg=${err.message.slice(0, 200)}`);
    return c.json(
      makeBody('META_API_ERROR', 'Erro ao falar com o Meta Ads', requestId),
      err.statusCode === 504 ? 504 : (err.statusCode as 400 | 401 | 403 | 404 | 422 | 500 | 502),
    );
  }

  // 3. Zod validation
  if (err instanceof ZodError) {
    const details = err.issues.map((iss) => ({
      path: iss.path.join('.'),
      message: iss.message,
      code: iss.code,
    }));
    console.warn(`[api] validation_error req=${requestId} issues=${details.length}`);
    return c.json(
      makeBody('VALIDATION_ERROR', 'Dados de entrada inválidos', requestId, { details }),
      422,
    );
  }

  // 4. Fallback — erro genérico (NÃO leak da mensagem upstream)
  console.error(`[api] internal_error req=${requestId} msg=${err.message.slice(0, 200)}`);
  // F-S14 #5: capture em Sentry SÓ erros "internos" não-mapeados (500).
  // Erros mapeados (HttpError, ProviderError, ZodError) são expected e
  // não vão pro Sentry — evita ruído. Apenas 500 = bug real merece alerta.
  Sentry.captureException(err, {
    tags: { request_id: requestId },
    level: 'error',
  });
  return c.json(makeBody('INTERNAL_ERROR', 'Erro interno', requestId), 500);
}
