/**
 * `withRetry<T>` — exponential backoff retry wrapper para chamadas upstream.
 *
 * Source-of-truth: ADR-0008 §3.9 (retry policy auto-provisioner GTM).
 *
 * Default: `attempts=3` (logo 1 tentativa inicial + 3 retries = 4 tentativas
 * totais, per F-S04 AC-5 worst case ~7s antes de propagar error).
 *
 * Default `isRetryable`:
 *  - Erros com `statusCode` em [500..599] (5xx upstream transientes)
 *  - Network errors com `code` em ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
 *    'ENOTFOUND', 'EAI_AGAIN']
 *  - Erros TypeError com message contendo 'fetch failed' (undici network err)
 *
 * 4xx (401, 403, 404, 422, 429) = NÃO retryable (fail-fast):
 *  - 401 → token revogado, retry não resolve
 *  - 403 → permissão / domain mismatch, retry não resolve
 *  - 429 → rate limit, caller decide retry com Retry-After header
 *
 * Backoff sleep entre attempts segue array `backoff` (default `[1000, 2000,
 * 4000]`), clamped no length. Se `attempts > backoff.length`, último delay
 * é reusado.
 *
 * @example
 * ```ts
 * const result = await withRetry(() => fetch(url).then(handleResp), {
 *   attempts: 3,
 *   backoff: [1000, 2000, 4000],
 * });
 * ```
 */

export interface WithRetryOpts {
  /** Número de retries APÓS tentativa inicial. Default: 3 (= 4 tentativas totais). */
  attempts?: number;
  /** Array de delays em ms entre cada retry. Default: [1000, 2000, 4000]. */
  backoff?: number[];
  /** Custom retry predicate. Default: 5xx + network errors. */
  isRetryable?: (err: unknown) => boolean;
  /** Hook chamado antes de cada retry (não chamado antes do attempt inicial). */
  onRetry?: (err: unknown, attemptNumber: number) => void | Promise<void>;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/**
 * Default isRetryable predicate per ADR-0008 §3.9.
 * Retorna true para 5xx + network transients. Fail-fast em 4xx.
 */
export function defaultIsRetryable(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;

  const statusCode = (err as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number' && statusCode >= 500 && statusCode <= 599) {
    return true;
  }

  // 4xx fail-fast: explicit short-circuit (defensive — overlap com check acima
  // só por clareza de intent).
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return false;
  }

  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code)) {
    return true;
  }

  // Node 18+ undici: TypeError 'fetch failed' wraps network errors.
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
    return true;
  }

  // AbortSignal.timeout (Codex #4): undici throws DOMException name='TimeoutError'
  // (Node 20+) ou name='AbortError'. Trata como network transient — retentar
  // pode pegar conexão melhor. Caller signal (não-timeout) também cai aqui
  // mas o caller controla quando cancelar; retry só lhe daria nova chance.
  if (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError')
  ) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOpts = {},
): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const backoff = opts.backoff ?? DEFAULT_BACKOFF_MS;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  // Loop: 1 tentativa inicial + N retries = (attempts + 1) total iterations.
  for (let attemptIndex = 0; attemptIndex <= attempts; attemptIndex++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attemptIndex === attempts;
      if (isLastAttempt || !isRetryable(err)) {
        throw err;
      }

      // Backoff antes do próximo attempt (clamped no length do array).
      const delayIdx = Math.min(attemptIndex, backoff.length - 1);
      const delayMs = backoff[delayIdx] ?? 0;

      if (opts.onRetry) {
        await opts.onRetry(err, attemptIndex + 1);
      }

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  // Unreachable em prática (loop sempre return ou throw), mas TS exige.
  throw lastError;
}
