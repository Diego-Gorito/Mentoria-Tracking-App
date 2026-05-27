/**
 * sseBus — pub/sub bridge entre worker deployJob (publisher) e endpoint SSE
 * (consumer) usando Redis LIST como fila FIFO.
 *
 * Source-of-truth: `docs/stories/F-S12.md` AC-2 (publish) + AC-3 (consume) +
 * UX `docs/ux-auto-provisioner-gtm-flow.md` §3 Tela 5 (progress modal real-time).
 *
 * Decisões herdadas:
 *  - River Q4: `hono/streaming` native (sem dep extra).
 *  - ADR-0008 §3.4: deploy é async, status state machine flui em transitions.
 *  - F-S12 AC-3 nota: LIST/BRPOP é MVP; Redis Streams = Onda 1.5 (multi-consumer).
 *
 * Modelo
 * ------
 *  - Key Redis: `gtm:events:<installation_id>` (LIST).
 *  - Producer: `publishEvent` → LPUSH + EXPIRE 300s (auto-cleanup pós install).
 *  - Consumer: `popEvent` → BRPOP timeout 15s (default), retorna `null` em
 *    timeout pra disparar heartbeat SSE.
 *
 * Ordering: LPUSH adiciona head, BRPOP/RPOP retira tail → FIFO real preservado.
 *
 * Testability: `popEvent` é injectable via DI (`InstallationsDeps.popEvent`)
 * pra acomodar ioredis-mock (que NÃO implementa BRPOP). Tests passam um
 * adapter rpop-based + sleep loop.
 */

import type { Redis as RedisClient } from 'ioredis';

import type { InstallationId } from './storage/types';

/**
 * TTL Redis pra LIST de eventos (F-S12 AC-2).
 *
 * 5 minutos cobre workers MVP <60s + retries + buffer. F-S12 Edge Case §5
 * sugere ajustar pra 10min se workers >5min observados em staging.
 */
export const SSE_EVENT_TTL_SEC = 300;

/**
 * Steps possíveis no pipeline de deploy — espelha audit actions de F-S07/F-S05.
 *
 * Terminais (SSE endpoint fecha o stream):
 *  - `pending_activation` — terminal happy path MVP (Codex #4, 2026-05-27):
 *    plugin foi upado mas aguarda ativação manual no wp-admin antes do
 *    validator. UI fecha modal, mostra CTA "Já ativei, validar agora".
 *  - `installed` — terminal happy path full (post-revalidate ou activation
 *    automática Sprint 4).
 *  - `failed` — terminal erro.
 */
export type SseEventStep =
  | 'upload_started'
  | 'upload_complete'
  | 'upload_failed'
  | 'activation_started'
  | 'activation_complete'
  | 'activation_failed'
  | 'validation_started'
  | 'validation_passed'
  | 'validation_failed'
  | 'pending_activation'
  | 'installed'
  | 'failed';

/**
 * Shape do evento publicado em Redis LIST (F-S12 AC-2).
 *
 * Mantém superfície estreita pra UI consumir direto (`useInstallTracking` em
 * `src/hooks/useInstallTracking.ts` — F-S11 paralela).
 */
export interface SseEvent {
  step: SseEventStep;
  status: 'in_progress' | 'done' | 'failed';
  timing_ms?: number;
  error?: string;
}

/**
 * Retorna chave Redis canônica do LIST de eventos.
 */
export function sseEventsKey(installationId: InstallationId | string): string {
  return `gtm:events:${installationId}`;
}

/**
 * Publica evento na LIST `gtm:events:<id>` (best-effort).
 *
 * - LPUSH adiciona head; consumer faz BRPOP tail → FIFO.
 * - EXPIRE 300s renovado a cada publish (auto-cleanup post-install).
 * - Erros são swallowed + logados (F-S12 AC-2: NÃO bloqueia pipeline).
 */
export async function publishEvent(
  redis: RedisClient,
  installationId: InstallationId,
  event: SseEvent,
): Promise<void> {
  const key = sseEventsKey(installationId);
  try {
    const payload = JSON.stringify(event);
    // pipeline garante atomicidade lpush + expire (1 round-trip).
    const pipeline = redis.multi();
    pipeline.lpush(key, payload);
    pipeline.expire(key, SSE_EVENT_TTL_SEC);
    await pipeline.exec();
  } catch (err) {
    // F-S12 AC-2: publish best-effort. Pipeline continua mesmo se Redis cair.
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[sseBus] publishEvent_failed id=${installationId} step=${event.step} msg=${msg}`,
    );
  }
}

/**
 * Função consumer abstraída (DI-friendly).
 *
 * `popEvent(redis, key, timeoutMs)` deve:
 *  - bloquear até `timeoutMs` esperando próximo elemento;
 *  - retornar `null` em timeout (caller emite heartbeat e re-loopa);
 *  - retornar string JSON do evento.
 *
 * Default impl usa BRPOP (converte ms → segundos com ceil, mínimo 1s — BRPOP
 * Redis nativo só aceita segundos inteiros). Tests injetam variante
 * rpop-based pra ioredis-mock que pode interpretar ms direto pra resolução
 * sub-segundo (necessário pra testar heartbeat sem suite lenta).
 */
export type PopEventFn = (
  redis: RedisClient,
  key: string,
  timeoutMs: number,
) => Promise<string | null>;

/**
 * Default consumer baseado em BRPOP (Redis nativo, prod).
 *
 * ioredis types: `brpop(...keys, timeout)` retorna `[key, value] | null`.
 * BRPOP timeout é em SEGUNDOS (inteiro). Converte ms→sec com ceil (mínimo 1s).
 */
export const defaultPopEvent: PopEventFn = async (redis, key, timeoutMs) => {
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  // ioredis: brpop com timeout 0 = bloqueia indefinidamente; usamos timeoutSec >0.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await (redis as any).brpop(key, timeoutSec)) as
    | [string, string]
    | null;
  if (!result) return null;
  return result[1];
};
