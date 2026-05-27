/**
 * translateApiError.ts — F-S11 AC-6
 *
 * Map de erros de API → mensagens PT-BR per UX §4.6 (`docs/ux-auto-provisioner-gtm-flow.md`).
 * Os 4 hooks F-S11 (useSites, useHostingerAccount, useInstallTracking,
 * useAuditLog) capturam erros do `fetch` e passam por esta função pra
 * normalizar `.message` antes de devolver ao componente.
 *
 * Estratégia de detecção:
 *  - Se `err` é `Response` (status >= 400), usa `err.status`.
 *  - Se `err` é `Error` com propriedade `.status` (anexada pelo hook quando
 *    chama `apiFetch`), usa `err.status`.
 *  - Se `err.message` cheira a network failure (TypeError "Failed to fetch",
 *    "Network failed", "NetworkError"), trata como network down.
 *  - Caso contrário, fallback genérico "Erro inesperado".
 *
 * Map (UX §4.6 + story AC-6):
 *  - Network failure (TypeError, "fetch") → "Sem conexão com o servidor"
 *  - 401                                  → "Sessão expirada — faça login novamente"
 *  - 403                                  → "Sem permissão pra realizar essa ação"
 *  - 404                                  → "Recurso não encontrado"
 *  - 409                                  → "Outro deploy em andamento pra esse site"
 *  - 422                                  → "Dados inválidos. Verifique os campos."
 *  - 5xx                                  → "Erro no servidor — tente novamente em instantes"
 *  - default                              → "Erro inesperado. Tente novamente."
 *
 * Retorna sempre um `Error` (não string) pra `.message` ser stável + caller
 * poder fazer `instanceof` checks se quiser.
 */

/** Erro com status HTTP anexado, emitido por `apiFetch` em cada hook. */
export interface ApiError extends Error {
  status?: number;
}

const NETWORK_MESSAGES_RE = /failed to fetch|network failed|networkerror|load failed/i;

export function translateApiError(err: unknown): Error {
  // Caso 1 — Response cru (raro: hook pode jogar a Response direto).
  if (typeof Response !== 'undefined' && err instanceof Response) {
    return new Error(messageForStatus(err.status));
  }

  // Caso 2 — Error com .status anexado (caminho default dos hooks).
  if (err instanceof Error) {
    const status = (err as ApiError).status;
    if (typeof status === 'number') {
      return new Error(messageForStatus(status));
    }

    // Caso 3 — TypeError / "Failed to fetch" / "Network failed" (offline).
    if (err instanceof TypeError || NETWORK_MESSAGES_RE.test(err.message)) {
      return new Error('Sem conexão com o servidor');
    }

    // Erro com message mas sem status — pode ser AbortError de cleanup.
    if (err.name === 'AbortError') {
      return new Error('Requisição cancelada');
    }

    // Fallback — não tem status nem network signature.
    return new Error('Erro inesperado. Tente novamente.');
  }

  // Caso 4 — não é Error nem Response (string, undefined, etc.).
  return new Error('Erro inesperado. Tente novamente.');
}

function messageForStatus(status: number): string {
  if (status === 401) return 'Sessão expirada — faça login novamente';
  if (status === 403) return 'Sem permissão pra realizar essa ação';
  if (status === 404) return 'Recurso não encontrado';
  if (status === 409) return 'Outro deploy em andamento pra esse site';
  if (status === 422) return 'Dados inválidos. Verifique os campos.';
  if (status >= 500) return 'Erro no servidor — tente novamente em instantes';
  return 'Erro inesperado. Tente novamente.';
}
