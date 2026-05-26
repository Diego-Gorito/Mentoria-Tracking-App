/**
 * Tests pra `withRetry<T>` — utility F-S04.
 *
 * Cobertura:
 *  - Happy path: 1 attempt → return
 *  - Retry recovery: 5xx → backoff → success
 *  - Fail-fast: 4xx errors not retried
 *  - Exhaustion: throws last error após N attempts esgotados
 *  - Network errors retryable
 *  - Custom isRetryable predicate
 *  - onRetry hook chamado com attempt N
 *
 * @see workers/lib/retry.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { defaultIsRetryable, withRetry } from '../retry';

describe('withRetry', () => {
  it('happy path: returns immediately on first success without retry', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and recovers on 2nd attempt', async () => {
    const err503 = Object.assign(new Error('upstream 503'), { statusCode: 503 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err503)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { backoff: [10, 10, 10] });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries up to 3 times and resolves on the 4th attempt total', async () => {
    const err500 = Object.assign(new Error('upstream 500'), { statusCode: 500 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err500)
      .mockRejectedValueOnce(err500)
      .mockRejectedValueOnce(err500)
      .mockResolvedValueOnce('finally');

    const result = await withRetry(fn, { backoff: [5, 5, 5] });
    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('fail-fast on 4xx — does not retry', async () => {
    const err403 = Object.assign(new Error('forbidden'), { statusCode: 403 });
    const fn = vi.fn().mockRejectedValue(err403);

    await expect(withRetry(fn, { backoff: [5, 5, 5] })).rejects.toBe(err403);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fail-fast on 401 (token invalid)', async () => {
    const err401 = Object.assign(new Error('unauth'), { statusCode: 401 });
    const fn = vi.fn().mockRejectedValue(err401);

    await expect(withRetry(fn)).rejects.toBe(err401);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fail-fast on 429 (rate limit) — caller handles Retry-After', async () => {
    const err429 = Object.assign(new Error('rate limited'), { statusCode: 429 });
    const fn = vi.fn().mockRejectedValue(err429);

    await expect(withRetry(fn)).rejects.toBe(err429);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws last error when all attempts exhausted on 5xx', async () => {
    const err502 = Object.assign(new Error('bad gateway'), { statusCode: 502 });
    const fn = vi.fn().mockRejectedValue(err502);

    await expect(
      withRetry(fn, { attempts: 3, backoff: [5, 5, 5] }),
    ).rejects.toBe(err502);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries = 4
  });

  it('retries on ECONNRESET network error', async () => {
    const netErr = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(netErr)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { backoff: [5, 5, 5] });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on TypeError "fetch failed" (undici network err)', async () => {
    const fetchErr = new TypeError('fetch failed');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(fetchErr)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { backoff: [5, 5, 5] });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects custom isRetryable predicate', async () => {
    const customErr = new Error('weird');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(customErr)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, {
      backoff: [5],
      isRetryable: (e) => e === customErr,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('onRetry hook called with err and attempt number (1-indexed)', async () => {
    const err500 = Object.assign(new Error('boom'), { statusCode: 500 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err500)
      .mockRejectedValueOnce(err500)
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    await withRetry(fn, { backoff: [5, 5, 5], onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, err500, 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, err500, 2);
  });

  it('uses last backoff value when attempts > backoff.length (clamped)', async () => {
    const err500 = Object.assign(new Error('boom'), { statusCode: 500 });
    const fn = vi.fn().mockRejectedValue(err500);

    // attempts=5 mas backoff só tem 2 valores
    await expect(
      withRetry(fn, { attempts: 5, backoff: [5, 10] }),
    ).rejects.toBe(err500);
    expect(fn).toHaveBeenCalledTimes(6); // 1 initial + 5 retries
  });
});

describe('defaultIsRetryable', () => {
  it('returns true for 5xx statusCode', () => {
    expect(defaultIsRetryable({ statusCode: 500 })).toBe(true);
    expect(defaultIsRetryable({ statusCode: 502 })).toBe(true);
    expect(defaultIsRetryable({ statusCode: 503 })).toBe(true);
    expect(defaultIsRetryable({ statusCode: 504 })).toBe(true);
    expect(defaultIsRetryable({ statusCode: 599 })).toBe(true);
  });

  it('returns false for 4xx statusCode', () => {
    expect(defaultIsRetryable({ statusCode: 400 })).toBe(false);
    expect(defaultIsRetryable({ statusCode: 401 })).toBe(false);
    expect(defaultIsRetryable({ statusCode: 403 })).toBe(false);
    expect(defaultIsRetryable({ statusCode: 404 })).toBe(false);
    expect(defaultIsRetryable({ statusCode: 422 })).toBe(false);
    expect(defaultIsRetryable({ statusCode: 429 })).toBe(false);
  });

  it('returns true for network error codes', () => {
    expect(defaultIsRetryable({ code: 'ECONNRESET' })).toBe(true);
    expect(defaultIsRetryable({ code: 'ETIMEDOUT' })).toBe(true);
    expect(defaultIsRetryable({ code: 'ECONNREFUSED' })).toBe(true);
    expect(defaultIsRetryable({ code: 'ENOTFOUND' })).toBe(true);
  });

  it('returns true for TypeError "fetch failed"', () => {
    expect(defaultIsRetryable(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns false for nulls / non-objects', () => {
    expect(defaultIsRetryable(null)).toBe(false);
    expect(defaultIsRetryable(undefined)).toBe(false);
    expect(defaultIsRetryable('string err')).toBe(false);
    expect(defaultIsRetryable(123)).toBe(false);
  });

  it('returns false for generic Error without statusCode/code', () => {
    expect(defaultIsRetryable(new Error('generic'))).toBe(false);
  });
});
