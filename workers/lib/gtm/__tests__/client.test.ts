import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GtmApiClient } from '../client';
import { GtmAuthError, GtmConflictError, GtmRateLimitError } from '../errors';

const ACCOUNT = '6059193756';
const SOURCE = '253664662';
const TARGET = '253999999';

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++] ?? responses[responses.length - 1];
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('GtmApiClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('GET getContainer faz chamada autenticada + retorna body', async () => {
    const fetchImpl = mockFetch([
      { status: 200, body: { containerId: '123', name: 'web-mentoria', publicId: 'GTM-XYZ' } },
    ]);
    const client = new GtmApiClient({
      throttleMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'fake-token',
    });
    const result = await client.getContainer(ACCOUNT, '123');
    expect(result.containerId).toBe('123');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/accounts/${ACCOUNT}/containers/123`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fake-token');
  });

  it('lança GtmAuthError em 401', async () => {
    const fetchImpl = mockFetch([
      { status: 401, body: { error: { message: 'invalid token' } } },
    ]);
    const client = new GtmApiClient({
      throttleMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'fake-token',
    });
    await expect(client.getContainer(ACCOUNT, '123')).rejects.toBeInstanceOf(GtmAuthError);
  });

  it('retry 429 → success', async () => {
    const fetchImpl = mockFetch([
      { status: 429, body: { error: { message: 'rate limit' } } },
      { status: 200, body: { containerId: '123', name: 'x', publicId: 'GTM-X' } },
    ]);
    const client = new GtmApiClient({
      throttleMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'tok',
    });
    const p = client.getContainer(ACCOUNT, '123');
    // Avança o timer pra cobrir backoff 1s
    await vi.advanceTimersByTimeAsync(1100);
    const result = await p;
    expect(result.containerId).toBe('123');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('after 3 retries throws GtmRateLimitError', async () => {
    const fetchImpl = mockFetch([
      { status: 429, body: { error: { message: 'rate limit' } } },
      { status: 429, body: { error: { message: 'rate limit' } } },
      { status: 429, body: { error: { message: 'rate limit' } } },
    ]);
    const client = new GtmApiClient({
      throttleMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'tok',
    });
    const p = client.getContainer(ACCOUNT, '123');
    // Avança todos os backoffs
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).rejects.toBeInstanceOf(GtmRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('createContainer POSTa body correto', async () => {
    const fetchImpl = mockFetch([
      { status: 200, body: { containerId: '999', name: 'foo', publicId: 'GTM-FOO', usageContext: ['web'] } },
    ]);
    const client = new GtmApiClient({
      throttleMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'tok',
    });
    const result = await client.createContainer(ACCOUNT, 'foo', ['web']);
    expect(result.containerId).toBe('999');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ name: 'foo', usageContext: ['web'] });
  });

  it('throttle entre 2 requests aplica delay (smoke)', async () => {
    const fetchImpl = mockFetch([
      { status: 200, body: { containerId: '1', name: 'x', publicId: 'a' } },
      { status: 200, body: { containerId: '2', name: 'y', publicId: 'b' } },
    ]);
    const client = new GtmApiClient({
      throttleMs: 200,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'tok',
    });
    const start = Date.now();
    vi.setSystemTime(start);
    const p1 = client.getContainer(ACCOUNT, '1');
    await vi.advanceTimersByTimeAsync(10);
    await p1;
    const p2 = client.getContainer(ACCOUNT, '2');
    // 2º request precisa esperar ~190ms
    await vi.advanceTimersByTimeAsync(250);
    await p2;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('copyContainerContents conflict em template não bloqueia clone', async () => {
    // 1. list templates source → 2 templates
    // 2. createTemplate #1 → conflict
    // 3. createTemplate #2 → success
    // 4. list vars source → 1 var
    // 5. createVariable → success
    // 6. list triggers → 0
    // 7. list clients → 0
    // 8. list tags → 0
    const fetchImpl = mockFetch([
      {
        status: 200,
        body: { template: [
          { templateId: '1', name: 'T1', templateData: 'data1' },
          { templateId: '2', name: 'T2', templateData: 'data2' },
        ] },
      },
      { status: 409, body: { error: { message: 'already exists' } } },
      { status: 200, body: { templateId: '99', name: 'T2', templateData: 'data2' } },
      { status: 200, body: { variable: [{ variableId: '10', name: 'V1', type: 'c' }] } },
      { status: 200, body: { variableId: '50', name: 'V1', type: 'c' } },
      { status: 200, body: { trigger: [] } },
      { status: 200, body: { client: [] } },
      { status: 200, body: { tag: [] } },
    ]);
    const client = new GtmApiClient({
      throttleMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'tok',
    });
    const progress: string[] = [];
    const p = client.copyContainerContents({
      sourceAccountId: ACCOUNT,
      sourceContainerId: SOURCE,
      sourceWorkspaceId: '2',
      targetAccountId: ACCOUNT,
      targetContainerId: TARGET,
      targetWorkspaceId: '1',
      onProgress: (step) => progress.push(step),
    });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.copiedCounts.templates).toBe(1); // 1 ok, 1 conflict ignored
    expect(result.copiedCounts.variables).toBe(1);
    expect(progress).toContain('init');
    expect(progress).toContain('complete');
  });
});
