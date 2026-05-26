// translateApiError.test.tsx — F-S11 AC-6
// Map completo dos status HTTP + network failure → mensagens PT-BR.
// Bonus suite além dos 12 cenários core (cobre helper standalone).

import { describe, it, expect } from 'vitest';
import { translateApiError, type ApiError } from '@/lib/translateApiError';

function errWithStatus(status: number, message = 'boom'): ApiError {
  const e: ApiError = new Error(message);
  e.status = status;
  return e;
}

describe('translateApiError (F-S11 AC-6)', () => {
  it('TypeError "Failed to fetch" → "Sem conexão com o servidor"', () => {
    const result = translateApiError(new TypeError('Failed to fetch'));
    expect(result.message).toBe('Sem conexão com o servidor');
  });

  it('Error com message matching network regex → "Sem conexão"', () => {
    const result = translateApiError(new Error('Network failed'));
    expect(result.message).toBe('Sem conexão com o servidor');
  });

  it('status 401 → "Sessão expirada"', () => {
    const result = translateApiError(errWithStatus(401));
    expect(result.message).toMatch(/Sessão expirada/);
  });

  it('status 403 → "Sem permissão"', () => {
    const result = translateApiError(errWithStatus(403));
    expect(result.message).toMatch(/Sem permissão/);
  });

  it('status 404 → "Recurso não encontrado"', () => {
    const result = translateApiError(errWithStatus(404));
    expect(result.message).toBe('Recurso não encontrado');
  });

  it('status 409 → "Outro deploy em andamento"', () => {
    const result = translateApiError(errWithStatus(409));
    expect(result.message).toMatch(/Outro deploy em andamento/);
  });

  it('status 422 → "Dados inválidos"', () => {
    const result = translateApiError(errWithStatus(422));
    expect(result.message).toMatch(/Dados inválidos/);
  });

  it('status 500 → "Erro no servidor — tente novamente"', () => {
    const result = translateApiError(errWithStatus(500));
    expect(result.message).toMatch(/Erro no servidor/);
  });

  it('status 503 (5xx) → "Erro no servidor"', () => {
    const result = translateApiError(errWithStatus(503));
    expect(result.message).toMatch(/Erro no servidor/);
  });

  it('Response cru com status 401 → "Sessão expirada"', () => {
    const res = new Response('', { status: 401 });
    const result = translateApiError(res);
    expect(result.message).toMatch(/Sessão expirada/);
  });

  it('Error sem status nem network sig → fallback genérico', () => {
    const result = translateApiError(new Error('algo aleatório'));
    expect(result.message).toMatch(/Erro inesperado/);
  });

  it('non-Error (string, undefined) → fallback genérico', () => {
    expect(translateApiError('foo').message).toMatch(/Erro inesperado/);
    expect(translateApiError(undefined).message).toMatch(/Erro inesperado/);
  });
});
