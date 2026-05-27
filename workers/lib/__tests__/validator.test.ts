/**
 * Tests pra `validate(domain, expectedContainerId)` — F-S06 AC-5 (5 cenários).
 *
 * Cobertura literal:
 *  1. Happy path — HEAD 200 + GET com dataLayer + GTM-WVWQVMP → passed=true
 *  2. dataLayer ausente → passed=false, datalayerMatch=false
 *  3. Container errado (GTM-OUTRA1 mas não GTM-WVWQVMP) → passed=false,
 *     expectedMatch=false, containerMatch=true
 *  4. Site offline HEAD 503 → passed=false, stage='head', reason='HTTP 503'
 *  5. Timeout (HEAD demora >5s) → passed=false, reason match /timeout/
 *
 * Mock HTTP via `msw@^2` (`setupServer` Node).
 *
 * @see workers/lib/validator.ts
 * @see ADR-0008 §3.6
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { validate } from '../validator';

const HTML_OK = `<html><head>
<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}</script>
<!-- Google Tag Manager: GTM-WVWQVMP -->
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-WVWQVMP"></script>
</head><body></body></html>`;

const HTML_NO_DATALAYER = `<html><head>
<!-- GTM-WVWQVMP container ref sem inline init -->
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-WVWQVMP"></script>
</head><body></body></html>`;

const HTML_WRONG_CONTAINER = `<html><head>
<script>window.dataLayer = window.dataLayer || []; var dataLayer = [];</script>
<!-- container instalado errado -->
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-OUTRA1"></script>
</head><body></body></html>`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('validate 2-stage (F-S06 AC-5)', () => {
  it('happy path: HEAD 200 + GET com dataLayer + container correto → passed=true', async () => {
    server.use(
      http.head('https://zerohum.com.br/', () => new HttpResponse(null, { status: 200 })),
      http.get('https://zerohum.com.br/', () => HttpResponse.text(HTML_OK)),
    );

    const r = await validate('zerohum.com.br', 'GTM-WVWQVMP');

    expect(r.passed).toBe(true);
    expect(r.stage).toBe('full');
    expect(r.details).toEqual({
      containerMatch: true,
      expectedMatch: true,
      datalayerMatch: true,
      expectedContainerId: 'GTM-WVWQVMP',
    });
  });

  it('dataLayer ausente → passed=false, datalayerMatch=false', async () => {
    server.use(
      http.head('https://x.com/', () => new HttpResponse(null, { status: 200 })),
      http.get('https://x.com/', () => HttpResponse.text(HTML_NO_DATALAYER)),
    );

    const r = await validate('x.com', 'GTM-WVWQVMP');

    expect(r.passed).toBe(false);
    expect(r.stage).toBe('full');
    expect(r.details?.datalayerMatch).toBe(false);
    expect(r.details?.expectedMatch).toBe(true);
    expect(r.details?.containerMatch).toBe(true);
  });

  it('container errado (GTM-OUTRA1 mas não GTM-WVWQVMP) → passed=false, expectedMatch=false, containerMatch=true', async () => {
    server.use(
      http.head('https://x.com/', () => new HttpResponse(null, { status: 200 })),
      http.get('https://x.com/', () => HttpResponse.text(HTML_WRONG_CONTAINER)),
    );

    const r = await validate('x.com', 'GTM-WVWQVMP');

    expect(r.passed).toBe(false);
    expect(r.stage).toBe('full');
    expect(r.details?.expectedMatch).toBe(false);
    expect(r.details?.containerMatch).toBe(true);
    expect(r.details?.datalayerMatch).toBe(true);
  });

  it('site offline HEAD 503 → passed=false, stage="head", reason="HTTP 503"', async () => {
    server.use(
      http.head('https://x.com/', () => new HttpResponse(null, { status: 503 })),
    );

    const r = await validate('x.com', 'GTM-WVWQVMP');

    expect(r.passed).toBe(false);
    expect(r.stage).toBe('head');
    expect(r.reason).toBe('HTTP 503');
    expect(r.details).toBeUndefined();
  });

  it('timeout (HEAD demora >5s) → passed=false, reason match /timeout/', async () => {
    server.use(
      http.head('https://x.com/', async () => {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const r = await validate('x.com', 'GTM-WVWQVMP');

    expect(r.passed).toBe(false);
    expect(r.stage).toBe('head');
    expect(r.reason).toMatch(/timeout/);
  }, 10000);
});
