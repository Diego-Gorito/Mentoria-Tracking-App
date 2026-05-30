/**
 * Tests pro MetaClient — parsing de responses + classificação de erros do Graph.
 * fetch é mockado; NÃO hita a Graph API real.
 */

import { describe, expect, it } from 'vitest';
import { MetaClient } from '../client';
import {
  MetaApiError,
  MetaPermissionError,
  MetaRateLimitError,
  MetaTokenInvalidError,
} from '../errors';

function fetchReturning(handler: (url: string) => { body: unknown; status?: number }): typeof fetch {
  return (async (url: string | URL): Promise<Response> => {
    const u = typeof url === 'string' ? url : url.toString();
    const { body, status = 200 } = handler(u);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('MetaClient.validateToken', () => {
  it('token válido → { valid, id, name, scopes }', async () => {
    const client = new MetaClient({
      fetchImpl: fetchReturning((u) => {
        if (u.includes('/me/permissions')) {
          return {
            body: {
              data: [
                { permission: 'ads_read', status: 'granted' },
                { permission: 'ads_management', status: 'granted' },
                { permission: 'email', status: 'declined' },
              ],
            },
          };
        }
        return { body: { id: 'sysuser-1', name: 'mentoria' } };
      }),
    });

    const info = await client.validateToken('tok');
    expect(info.valid).toBe(true);
    expect(info.id).toBe('sysuser-1');
    expect(info.name).toBe('mentoria');
    expect(info.scopes).toEqual(['ads_read', 'ads_management']); // só granted
  });

  it('token inválido (code 190) → MetaTokenInvalidError', async () => {
    const client = new MetaClient({
      fetchImpl: fetchReturning(() => ({
        body: { error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } },
        status: 400,
      })),
    });
    await expect(client.validateToken('bad')).rejects.toBeInstanceOf(MetaTokenInvalidError);
  });

  it('validateToken não derruba se /me/permissions falhar (scopes vazio)', async () => {
    const client = new MetaClient({
      fetchImpl: fetchReturning((u) => {
        if (u.includes('/me/permissions')) return { body: { error: { message: 'x', code: 1 } }, status: 500 };
        return { body: { id: 'u1', name: 'n' } };
      }),
    });
    const info = await client.validateToken('tok');
    expect(info.valid).toBe(true);
    expect(info.scopes).toEqual([]);
  });
});

describe('MetaClient.listAdAccounts', () => {
  it('mapeia id/name/status/business_id', async () => {
    const client = new MetaClient({
      fetchImpl: fetchReturning(() => ({
        body: {
          data: [
            { id: 'act_1', name: 'A', account_status: 1, business: { id: 'biz-9' } },
            { id: 'act_2', name: 'B', account_status: 2 },
          ],
        },
      })),
    });
    const accts = await client.listAdAccounts('tok');
    expect(accts).toHaveLength(2);
    expect(accts[0]).toEqual({ id: 'act_1', name: 'A', status: 1, business_id: 'biz-9' });
    expect(accts[1].business_id).toBeNull();
  });
});

describe('MetaClient.listPixels', () => {
  it('prefixa act_ + mapeia last_fired_time null', async () => {
    let calledUrl = '';
    const client = new MetaClient({
      fetchImpl: fetchReturning((u) => {
        calledUrl = u;
        return { body: { data: [{ id: 'px1', name: 'Pixel' }] } };
      }),
    });
    const pixels = await client.listPixels('tok', '123456'); // sem act_
    expect(calledUrl).toContain('/act_123456/adspixels');
    expect(pixels[0]).toEqual({ id: 'px1', name: 'Pixel', last_fired_time: null });
  });
});

describe('MetaClient error classification', () => {
  it('rate limit (code 4) → MetaRateLimitError', async () => {
    const client = new MetaClient({
      fetchImpl: fetchReturning(() => ({
        body: { error: { message: 'rate', code: 4 } },
        status: 400,
      })),
    });
    await expect(client.listAdAccounts('tok')).rejects.toBeInstanceOf(MetaRateLimitError);
  });

  it('permissão (code 10) → MetaPermissionError', async () => {
    const client = new MetaClient({
      fetchImpl: fetchReturning(() => ({
        body: { error: { message: 'no perm', code: 10 } },
        status: 403,
      })),
    });
    await expect(client.listAdAccounts('tok')).rejects.toBeInstanceOf(MetaPermissionError);
  });

  it('erro genérico 500 → MetaApiError (statusCode 502)', async () => {
    const client = new MetaClient({
      fetchImpl: fetchReturning(() => ({ body: { error: { message: 'boom', code: 1 } }, status: 500 })),
    });
    await expect(client.listAdAccounts('tok')).rejects.toMatchObject({
      name: 'MetaApiError',
      statusCode: 502,
    });
  });

  it('não vaza o token na mensagem de erro de rede', async () => {
    const client = new MetaClient({
      fetchImpl: (async () => {
        const e = new Error('boom');
        e.name = 'TimeoutError';
        throw e;
      }) as unknown as typeof fetch,
    });
    try {
      await client.validateToken('SUPER-SECRET-TOKEN');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MetaApiError);
      expect((err as Error).message).not.toContain('SUPER-SECRET-TOKEN');
    }
  });
});
