/**
 * requestId middleware — gera UUID v4 por request + propaga em response header.
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-10 (request_id no error body +
 * X-Request-ID header pra correlação logs).
 *
 * Honra header `X-Request-ID` do upstream (e.g. load balancer) se presente —
 * útil pra rastreamento end-to-end. Caso contrário gera novo.
 */

import { randomUUID } from 'node:crypto';
import type { Context, Next } from 'hono';

export async function requestIdMiddleware(c: Context, next: Next): Promise<void> {
  const incoming = c.req.header('X-Request-ID');
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();

  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);

  await next();
}

/**
 * Helper — recupera requestId do context Hono. Retorna '' se middleware não
 * rodou (defensivo — não deve acontecer em prod).
 */
export function getRequestId(c: Context): string {
  return (c.get('requestId') as string | undefined) ?? '';
}
