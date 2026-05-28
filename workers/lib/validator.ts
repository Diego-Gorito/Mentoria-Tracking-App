/**
 * `validate(domain, expectedContainerId)` — validador pós-deploy 2-stage.
 *
 * Source-of-truth: ADR-0008 §3.6 (validador 2-stage HEAD+GET, pseudo-código
 * literal). Story F-S06.
 *
 * Strategy:
 *  - Stage 1 (HEAD fast-path): `fetch HEAD` com timeout 5s. Se NÃO 2xx →
 *    fail rápido sem stage 2 (`{ passed: false, stage: 'head', reason }`).
 *  - Stage 2 (GET + regex 3 checks): só executa se stage 1 OK. Carrega html
 *    via `.text()` + aplica 3 regex pré-compiladas no body:
 *      * containerMatch — qualquer container válido `/GTM-[A-Z0-9]{6,8}/`
 *      * expectedMatch — literal `html.includes(expectedContainerId)`
 *      * datalayerMatch — boilerplate GTM4WP (`window.dataLayer = ...` OR
 *        `dataLayer = [`)
 *    Retorna `{ passed: all3, stage: 'full', details }`.
 *
 * Timeout total worst case: 5s HEAD + 5s GET = 10s.
 *
 * Stateless — pode ser chamado de qualquer worker/cron Onda 1.5.
 *
 * @example
 * ```ts
 * const r = await validate('colegiomentoria.com.br', 'GTM-5J587HS3');
 * if (r.passed) console.log('OK');
 * else console.warn('drift:', r.reason ?? r.details);
 * ```
 */

export interface ValidationResult {
  passed: boolean;
  stage: 'head' | 'full';
  details?: {
    containerMatch: boolean;
    expectedMatch: boolean;
    datalayerMatch: boolean;
    expectedContainerId: string;
  };
  reason?: string;
}

const CONTAINER_PATTERN = /GTM-[A-Z0-9]{6,8}/;

// Patterns que indicam GTM/dataLayer presente no HTML.
// Match LOGICAL OR — qualquer um sinaliza GTM ativo.
//
// FIX 2026-05-28 (F-S14 #4): patterns originais só detectavam initialization
// explícita (`window.dataLayer = window.dataLayer || []` ou `dataLayer = [`).
// O snippet GTM canônico oficial usa IIFE com nome de var ofuscado:
//   (function(w,d,s,l,i){ w[l]=w[l]||[]; ... })(window,document,'script','dataLayer','GTM-XXX');
// O `dataLayer` literal só aparece como parâmetro IIFE, não como assignment.
// Smoke F-S14 em ifrn.com.br: regex falhava com `datalayerMatch=false` mesmo
// com GTM 100% funcional (containerMatch=true, expectedMatch=true).
const DATALAYER_PATTERN_1 = /window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/;
const DATALAYER_PATTERN_2 = /dataLayer\s*=\s*\[/;
// Padrão IIFE canônico GTM (sempre tem `gtm.start` event no init)
const DATALAYER_PATTERN_3 = /['"]gtm\.start['"]/;
// Script src do gtm.js — onde o GTM init é carregado
const DATALAYER_PATTERN_4 = /googletagmanager\.com\/gtm\.js/;

const STAGE_TIMEOUT_MS = 5000;

export async function validate(
  domain: string,
  expectedContainerId: string,
): Promise<ValidationResult> {
  const url = 'https://' + domain + '/';

  // Stage 1: HEAD fast-path.
  let headResp: Response;
  try {
    headResp = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(STAGE_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = isTimeoutError(err) ? 'timeout' : 'network_error';
    return { passed: false, stage: 'head', reason };
  }

  if (!headResp.ok) {
    return { passed: false, stage: 'head', reason: `HTTP ${headResp.status}` };
  }

  // Stage 2: full GET + regex 3 checks.
  let html: string;
  try {
    const getResp = await fetch(url, {
      signal: AbortSignal.timeout(STAGE_TIMEOUT_MS),
    });
    if (!getResp.ok) {
      return { passed: false, stage: 'full', reason: `HTTP ${getResp.status}` };
    }
    html = await getResp.text();
  } catch (err) {
    const reason = isTimeoutError(err) ? 'timeout' : 'network_error';
    return { passed: false, stage: 'full', reason };
  }

  const containerMatch = CONTAINER_PATTERN.test(html);
  const expectedMatch = html.includes(expectedContainerId);
  const datalayerMatch =
    DATALAYER_PATTERN_1.test(html) ||
    DATALAYER_PATTERN_2.test(html) ||
    DATALAYER_PATTERN_3.test(html) ||
    DATALAYER_PATTERN_4.test(html);

  return {
    passed: containerMatch && expectedMatch && datalayerMatch,
    stage: 'full',
    details: {
      containerMatch,
      expectedMatch,
      datalayerMatch,
      expectedContainerId,
    },
  };
}

function isTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}
