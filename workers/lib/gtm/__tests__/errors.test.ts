import { describe, expect, it } from 'vitest';
import {
  classifyGtmError,
  GtmApiError,
  GtmAuthError,
  GtmConflictError,
  GtmNotFoundError,
  GtmQuotaExceededError,
  GtmRateLimitError,
} from '../errors';

describe('gtm/errors.ts classifyGtmError', () => {
  it('mapeia 401 → GtmAuthError', () => {
    const e = classifyGtmError(401, { error: { message: 'unauth' } });
    expect(e).toBeInstanceOf(GtmAuthError);
    expect(e.statusCode).toBe(403);
  });

  it('mapeia 403 com message "quota" → GtmQuotaExceededError', () => {
    const e = classifyGtmError(403, { error: { message: 'Daily quota exceeded' } });
    expect(e).toBeInstanceOf(GtmQuotaExceededError);
  });

  it('mapeia 403 com status PERMISSION_DENIED → GtmAuthError', () => {
    const e = classifyGtmError(403, {
      error: { message: 'no perm', status: 'PERMISSION_DENIED' },
    });
    expect(e).toBeInstanceOf(GtmAuthError);
  });

  it('mapeia 404 → GtmNotFoundError', () => {
    const e = classifyGtmError(404, { error: { message: 'not found' } });
    expect(e).toBeInstanceOf(GtmNotFoundError);
  });

  it('mapeia 409 → GtmConflictError', () => {
    const e = classifyGtmError(409, { error: { message: 'conflict' } });
    expect(e).toBeInstanceOf(GtmConflictError);
  });

  it('mapeia 429 → GtmRateLimitError com retryAfter default 60s', () => {
    const e = classifyGtmError(429, { error: { message: 'rate limited' } });
    expect(e).toBeInstanceOf(GtmRateLimitError);
    expect((e as GtmRateLimitError).retryAfterSeconds).toBe(60);
  });

  it('mapeia 500 → GtmApiError genérico', () => {
    const e = classifyGtmError(500, { error: { message: 'internal' } });
    expect(e).toBeInstanceOf(GtmApiError);
    expect(e).not.toBeInstanceOf(GtmAuthError);
    expect(e.statusCode).toBe(500);
  });

  it('lida com body vazio (mensagem default)', () => {
    const e = classifyGtmError(500, undefined);
    expect(e.message).toBe('Unknown GTM API error');
  });
});
