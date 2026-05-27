/**
 * `safeAuditPayload` + `appendAuditWithSanitization` — LGPD-safe audit helpers.
 *
 * Source-of-truth: ADR-0008 §3.7 (LGPD) — define whitelist + blacklist literais.
 * Storage contract: ADR-0008a §2.4 — `InstallationAudit.payload: Record<string, unknown>`.
 *
 * Story F-S07. Centraliza sanitization para que callers (HostingerAdapter,
 * installations endpoints, deployJob) NUNCA gravem tokens / passwords /
 * response bodies brutos em `gtm:audit:*`.
 *
 * Pattern espelha `core.hash_pii` defensive philosophy (CLAUDE.md regra #1):
 * blacklist regex remove keys sensíveis SILENCIOSAMENTE (sem throw) — caller
 * que tentar logar `{ token: '...' }` por engano fica defensivo by-default.
 *
 * Pure function — sem side effects, sem async. `appendAuditWithSanitization`
 * é o único wrapper async (delega para `storage.appendAudit`).
 */

import type { IGtmStorage } from './storage/IStorage';
import type { InstallationAudit, InstallationId, TenantId } from './storage/types';

/**
 * Payload sanitizado pronto pra `installation_audit.payload`.
 *
 * 7 keys whitelisted (ADR-0008 §3.7). Open shape via index signature permite
 * extension futura, mas blacklist regex sempre roda — keys sensíveis
 * filtradas mesmo se aceitas pela whitelist.
 */
export interface SafePayload {
  site_domain?: string;
  status_code?: number;
  timing_ms?: number;
  file_count?: number;
  upload_dir_name?: string;
  /** ≤500 chars (truncado silenciosamente sem reticências). */
  error_summary?: string;
  retry_attempt?: number;
  [key: string]: unknown;
}

/**
 * Whitelist top-level keys aceitas em `safeAuditPayload`. Top-level keys fora
 * dessa lista são descartadas — EXCETO nested objects, que preservam estrutura
 * mas têm blacklist regex aplicada recursivamente (AC-6).
 */
const ALLOWED_KEYS = new Set([
  'site_domain',
  'status_code',
  'timing_ms',
  'file_count',
  'upload_dir_name',
  'error_summary',
  'retry_attempt',
]);

/**
 * Blacklist regex case-insensitive. Qualquer key matching é removida
 * silenciosamente em CADA nível (top-level + nested até depth=3).
 *
 * Cobre: token, password, secret, bearer, authorization, api_key / api-key /
 * apikey (variantes hífen/underscore/none via `[_-]?`).
 */
const SENSITIVE_PATTERN = /token|password|secret|bearer|authorization|api[_-]?key/i;

/** Profundidade máxima recursão nested (proteção contra circular refs). */
const MAX_DEPTH = 3;

/** Truncate limit para `error_summary` (ADR-0008 §3.7). */
const ERROR_SUMMARY_MAX = 500;

/**
 * Type-guard pra "plain object" (literal `{}` ou `new Object()`). Rejeita
 * arrays, class instances (Date, Map, custom classes), null. Necessário pra
 * recursão nested segura.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return (value as object).constructor === Object;
}

/**
 * Aplica blacklist regex recursivamente em nested object. Preserva keys não
 * sensíveis. Para em `MAX_DEPTH` (default 3) — keys além desse nível são
 * eliminadas (proteção circular ref).
 *
 * NÃO aplica whitelist nested — só blacklist (preserva estrutura inocente,
 * per AC-6).
 */
function sanitizeNested(
  obj: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  if (depth > MAX_DEPTH) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_PATTERN.test(key)) continue; // blacklist
    if (isPlainObject(value)) {
      out[key] = sanitizeNested(value, depth + 1);
    } else {
      // Preserva primitives, arrays, undefined, etc. (sem walk dentro)
      out[key] = value;
    }
  }
  return out;
}

/**
 * Sanitiza raw payload aplicando whitelist (top-level) + blacklist regex
 * (todos níveis até depth=3). Pure function — sem side effects.
 *
 * @param raw Payload bruto vindo de caller (ex: HostingerAdapter response).
 * @returns Payload LGPD-safe pronto pra `installation_audit.payload`.
 *
 * Edge cases:
 * - Empty `{}` → `{}`
 * - `undefined` value em allowed key → preservado
 * - Class instance em nested → rejeitado (`isPlainObject` false → preserva ref)
 * - Circular ref → depth=3 corta loop
 * - `error_summary` > 500 chars → fatiado sem reticências
 */
export function safeAuditPayload(raw: Record<string, unknown>): SafePayload {
  const out: SafePayload = {};
  for (const [key, value] of Object.entries(raw)) {
    // Blacklist roda PRIMEIRO — mesmo se key estiver na whitelist, remove se
    // matches sensitive pattern (defesa em camadas).
    if (SENSITIVE_PATTERN.test(key)) continue;
    if (!ALLOWED_KEYS.has(key)) continue; // whitelist top-level
    if (key === 'error_summary' && typeof value === 'string' && value.length > ERROR_SUMMARY_MAX) {
      out[key] = value.slice(0, ERROR_SUMMARY_MAX);
      continue;
    }
    if (isPlainObject(value)) {
      // Nested object: aplica blacklist recursivo (sem whitelist).
      out[key] = sanitizeNested(value, 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Wrapper async que centraliza sanitization + delega pra `storage.appendAudit`.
 *
 * Callers em F-S04 (HostingerAdapter), F-S05 (installations.ts) e F-S08
 * (deployJob.ts) DEVEM usar este wrapper — nunca chamar `storage.appendAudit`
 * direto — para garantir que payload SEMPRE passa por `safeAuditPayload`.
 *
 * Quinn QA gate (Sprint 1) valida via grep que `storage.appendAudit` só é
 * chamado de dentro deste arquivo.
 *
 * @param storage Implementation de `IGtmStorage` (Redis MVP / Supabase Onda 1.5).
 * @param input Audit row sem `id`/`created_at` (gerados pela storage impl).
 *              `rawPayload` é sanitizado antes do INSERT/LPUSH.
 */
export async function appendAuditWithSanitization(
  storage: IGtmStorage,
  input: {
    installation_id: InstallationId;
    tenant_id: TenantId;
    action: InstallationAudit['action'];
    rawPayload?: Record<string, unknown>;
    actor_user_id?: string;
    actor_source: InstallationAudit['actor_source'];
  },
): Promise<void> {
  const payload = safeAuditPayload(input.rawPayload ?? {});
  await storage.appendAudit({
    installation_id: input.installation_id,
    tenant_id: input.tenant_id,
    action: input.action,
    payload,
    actor_user_id: input.actor_user_id,
    actor_source: input.actor_source,
  });
}
