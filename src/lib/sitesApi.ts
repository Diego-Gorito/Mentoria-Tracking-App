/**
 * sitesApi.ts — fetch helper compartilhado pelos hooks F-S11.
 *
 * Por que não reusar `src/lib/api.ts` `request()`?
 *  - `request` é private (não exportado).
 *  - `request` strippa o HTTP status code antes de throw (usa só `body.error`),
 *    o que quebra AC-6 — `translateApiError` precisa do status pra mapear
 *    401→"Sessão expirada", 409→"Outro deploy em andamento", etc.
 *
 * `apiFetch` aqui:
 *  - Injeta Bearer JWT (reusa `getToken` de auth.ts).
 *  - Resolve baseURL (localhost:3000 em dev, same-origin em prod — mesma
 *    convenção de api.ts WORKER_BASE).
 *  - Em erro HTTP throw `Error` com `.status` anexado (ApiError shape).
 *  - Em network failure deixa TypeError propagar — `translateApiError` mapeia.
 *  - Suporta AbortSignal pra cleanup em useEffect.
 *
 * NÃO faz refresh-token auto (api.ts já cobre — hooks F-S11 são pra dados
 * F-S05; 401 leva o user pra login via AuthGuard).
 */

import { getToken } from './auth';
import type { ApiError } from './translateApiError';

// Mesma convenção de src/lib/api.ts.
const API_BASE =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : '';

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
  body?: unknown;
  signal?: AbortSignal;
  /** Pula injeção de Authorization (rotas públicas). Default false. */
  publicRoute?: boolean;
}

/**
 * fetch wrapper que preserva HTTP status no Error pra `translateApiError`.
 * Returns parsed JSON body em sucesso (qualquer 2xx com Content-Type JSON).
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, publicRoute = false } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!publicRoute) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    // Tenta extrair body.error.message PT-BR do backend; se falhar usa fallback.
    const backendMessage = await extractBackendMessage(res);
    const err: ApiError = new Error(backendMessage ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  // 204 No Content — nada pra parse.
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

async function extractBackendMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    if (typeof body.error === 'object' && body.error?.message) {
      return body.error.message;
    }
    if (typeof body.error === 'string') return body.error;
    return null;
  } catch {
    return null;
  }
}
