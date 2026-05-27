/**
 * installations.ts — Hono router /api/installations/*
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-5 a AC-9.
 *
 * Endpoints (todos protegidos por authMiddleware):
 *   POST   /                 — AC-5: cria draft + lookup container hardcoded
 *   POST   /:id/deploy       — AC-6: acquireLock + dispara deployJob async
 *   GET    /:id              — AC-7: status atual (Cache-Control no-store)
 *   POST   /:id/revalidate   — AC-8: re-roda validador (stub TODO F-S06)
 *   DELETE /:id              — AC-9: soft delete + X-Onda warning header
 *
 * Worker async: setImmediate(() => deployJob(id, deps)) — single-replica MVP.
 * Onda 1.5: considerar BullMQ pra resilience cross-restart.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { Redis as RedisClient } from 'ioredis';

import { authMiddleware, getAuthCtx, type AuthContext } from './middleware';
import { getStorage, type IGtmStorage } from '../lib/storage';
import { sealDecrypt } from '../lib/storage/crypto';
import { getProvider, type IHostingProvider } from '../lib/providers';
import type {
  AccountId,
  GtmInstallation,
  HostingAccount,
  InstallationId,
  ISO8601,
  TenantId,
} from '../lib/storage/types';
import {
  BRAND_GTM_MAP,
  DEFAULT_PLUGIN_VERSION,
  isBrandSlug,
  type BrandSlug,
} from '../lib/constants';
import { LockConflictError } from './errors';
import { deployJob, type DeployJobDeps } from './deployJob';
import { validate as runValidator, type ValidationResult } from '../lib/validator';
import { appendAuditWithSanitization } from '../lib/audit';

/**
 * Type standalone do validator F-S06 — usado pelo /revalidate.
 * Antes era `DeployJobDeps['validate']` mas Codex #4 removeu validate
 * do pipeline de deploy (deployJob → /revalidate).
 */
type ValidatorFn = (
  domain: string,
  expectedContainerId: string,
) => Promise<ValidationResult>;
import { getRedis } from '../lib/redis';
import {
  defaultPopEvent,
  sseEventsKey,
  type PopEventFn,
  type SseEvent,
} from '../lib/sseBus';
import { resolveTenantId, assertTenantOwnership } from './tenantGuard';

// ---------- Zod schemas ----------

const BrandSlugSchema = z.custom<BrandSlug>(
  (v) => isBrandSlug(v),
  'brand_slug deve ser mentoria | mentoria-app | zerohum | ifrn',
);

const CreateInstallationSchema = z.object({
  hosting_account_id: z.string().uuid(),
  site_domain: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'site_domain inválido'),
  brand_slug: BrandSlugSchema,
});

// ---------- Vars + DI ----------

export type InstallationsVars = {
  authCtx: AuthContext;
  requestId: string;
};

interface InstallationsDeps {
  storage?: IGtmStorage;
  providerFactory?: (
    type: 'hostinger',
    creds: { token: string; wpAdminPassword?: string },
  ) => IHostingProvider;
  authOverride?: (c: Parameters<typeof authMiddleware>[0], n: Parameters<typeof authMiddleware>[1]) => Promise<Response | void>;
  /**
   * Hook pra disparar deployJob — default usa setImmediate.
   * Testes injetam versão sync (await) pra inspecionar resultado direto.
   */
  scheduleDeploy?: (id: InstallationId, deps: DeployJobDeps) => void | Promise<void>;
  /** Override do validator (testes /revalidate). */
  validate?: ValidatorFn;
  /** Override do buildPlugin (testes). */
  buildPlugin?: DeployJobDeps['buildPlugin'];
  /**
   * Client Redis usado pra publicar SSE events (deployJob) + consumir no
   * endpoint `GET /:id/events` (F-S12 AC-2 + AC-3).
   * Default: singleton `getRedis()` de `workers/lib/redis.ts`.
   * Tests injetam ioredis-mock pra evitar Redis real.
   */
  redisClient?: RedisClient;
  /**
   * Consumer fn injetada (F-S12 AC-3). Default usa BRPOP (Redis prod).
   * Tests passam variante rpop-based pra compat com ioredis-mock (que NÃO
   * implementa BRPOP — confirmado em `node_modules/ioredis-mock/lib/index.js`).
   */
  popEvent?: PopEventFn;
  /**
   * Heartbeat interval (ms) entre `: ping\n\n` quando sem eventos (F-S12 AC-4).
   * Default 15000ms (15s). Tests passam valor menor pra acelerar suite.
   * Convertido pra segundos no BRPOP timeout.
   */
  heartbeatMs?: number;
}

// ---------- helpers ----------

async function buildProviderForAccount(
  account: HostingAccount,
  factory: (
    type: 'hostinger',
    creds: { token: string; wpAdminPassword?: string },
  ) => IHostingProvider,
): Promise<IHostingProvider> {
  const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY;
  const sec = process.env.STORAGE_ENCRYPTION_SECRET_KEY;
  if (!pub || !sec) {
    throw new Error('STORAGE_ENCRYPTION_PUBLIC_KEY/SECRET_KEY ausentes');
  }
  const token = await sealDecrypt(account.token_encrypted, pub, sec);
  const wpAdminPassword = account.wp_admin_creds_encrypted
    ? await sealDecrypt(account.wp_admin_creds_encrypted, pub, sec)
    : undefined;
  return factory(account.provider, { token, wpAdminPassword });
}

// ---------- factory ----------

export function createInstallationsRouter(
  deps: InstallationsDeps = {},
): Hono<{ Variables: InstallationsVars }> {
  const router = new Hono<{ Variables: InstallationsVars }>();
  const getStorageInstance = (): IGtmStorage => deps.storage ?? getStorage();
  const getProviderFn = deps.providerFactory ?? getProvider;
  const auth = deps.authOverride ?? authMiddleware;
  const scheduleDeploy =
    deps.scheduleDeploy ??
    ((id: InstallationId, jobDeps: DeployJobDeps) => {
      // setImmediate pra MVP — Onda 1.5 swap por BullMQ/Queue.
      //
      // DEBT (Codex adversarial #3, 2026-05-26): worker assíncrono in-process
      // significa que CRASH do container entre 202 (route response) e o
      // pipeline finish PERDE o job sem audit trail. Mitigação atual:
      //  - Lock TTL 180s impede 2º deploy concurrent no mesmo site
      //  - Polling fallback no frontend (F-S11 useInstallTracking) detecta
      //    status 'uploading' parado, UI mostra "Demorando…" pro Diego
      //  - F-S15 runbook documentará como reset manual via Redis
      // Fix real (Onda 1.5): BullMQ job persistido em Redis stream + worker
      // lease renew + CAS em updateInstallation.
      setImmediate(() => {
        void deployJob(id, jobDeps);
      });
    });

  // F-S12: Redis client + consumer pra SSE (lazy default = singleton prod).
  const getRedisClient = (): RedisClient => deps.redisClient ?? getRedis();
  const popEvent: PopEventFn = deps.popEvent ?? defaultPopEvent;
  const heartbeatMs = deps.heartbeatMs ?? 15_000;

  router.use('*', auth);

  // ── POST / ────────────────────────────────────────────────────────────────
  router.post('/', async (c) => {
    const ctx = getAuthCtx(c);
    const raw = await c.req.json();
    const input = CreateInstallationSchema.parse(raw); // ZodError → 422

    const storage = getStorageInstance();

    // Tenant guard: account precisa pertencer ao mesmo tenant do ctx (Codex #1).
    const account = await storage.getAccount(input.hosting_account_id as AccountId);
    assertTenantOwnership(account, ctx, 'hosting_account', input.hosting_account_id);

    // Backend hardcoded lookup do gtm_container_id (R4 PRD mitigado).
    const gtmContainerId = BRAND_GTM_MAP[input.brand_slug];

    // F-S01 createInstallation já implementa idempotência por site_domain
    // (sha1 reserve via SET NX). Se já existe pra esse domain, retorna o existente.
    const installation = await storage.createInstallation({
      tenant_id: resolveTenantId(ctx),
      hosting_account_id: input.hosting_account_id as AccountId,
      site_domain: input.site_domain.toLowerCase(),
      brand_slug: input.brand_slug,
      gtm_container_id: gtmContainerId,
      plugin_version: DEFAULT_PLUGIN_VERSION,
      status: 'draft',
      attempt_count: 0,
      created_by: ctx.userId,
    });

    await appendAuditWithSanitization(storage, {
      installation_id: installation.id,
      tenant_id: installation.tenant_id,
      action: 'draft_created',
      // brand_slug/gtm_container_id não estão na whitelist (ADR-0008 §3.7);
      // wrapper filtra. Action + installation.* já têm os dados typed.
      rawPayload: { site_domain: installation.site_domain },
      actor_user_id: ctx.userId,
      actor_source: 'tracking-api',
    });

    console.log(
      `[installations] draft user_id=${ctx.userId} id=${installation.id} domain=${installation.site_domain}`,
    );

    return c.json({ data: installation }, 201);
  });

  // ── POST /:id/deploy ──────────────────────────────────────────────────────
  router.post('/:id/deploy', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as InstallationId;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    assertTenantOwnership(installation, ctx, 'installation', id);

    // AC-6 step 1 — distributed lock (180s TTL).
    //
    // Codex adversarial #3 (2026-05-26): subiu de 60s pra 180s pra cobrir
    // upload + validate + retries.
    //
    // Codex adversarial #4 (2026-05-27): deploy não roda mais validate
    // (movido pra /revalidate), então worst case caiu pra ~157s:
    //   3 attempts × 50s (AbortSignal.timeout, HostingerAdapter) +
    //   backoff [1s, 2s, 4s] = 157s ≤ 180s lock.
    // Mantido 180s pra ter folga + cobrir buildPlugin I/O (~1-2s) +
    // audit append serialization (sync Redis).
    //
    // @todo Onda 1.5 — substituir setImmediate por BullMQ/queue durável.
    // Job perdido em restart entre 202 e finish é débito MVP declarado
    // (ADR-0008 + F-S05 story Tech Notes).
    const acquired = await storage.acquireLock(id, 180);
    if (!acquired) {
      throw new LockConflictError();
    }

    // Resolve account agora (validação cedo se account sumiu).
    const account = await storage.getAccount(installation.hosting_account_id);
    try {
      assertTenantOwnership(account, ctx, 'hosting_account', installation.hosting_account_id);
    } catch (err) {
      // libera lock antes de propagar — caller perdeu race com delete OR cross-tenant.
      await storage.releaseLock(id);
      throw err;
    }

    // AC-6 step 2 — dispara worker async via setImmediate (ou override em tests).
    // F-S12 AC-2: passa redisClient pro worker publicar SSE events.
    // Codex #4: validate removido do pipeline — só rola em /revalidate.
    const jobDeps: DeployJobDeps = {
      storage,
      getProvider: async (_inst) => buildProviderForAccount(account, getProviderFn),
      buildPlugin: deps.buildPlugin,
      redisClient: deps.redisClient ?? getRedisClient(),
    };

    await scheduleDeploy(id, jobDeps);

    console.log(`[installations] deploy_scheduled user_id=${ctx.userId} id=${id}`);

    return c.json(
      {
        data: {
          job_id: id,
          sse_url: `/api/installations/${id}/events`,
        },
      },
      202,
    );
  });

  // ── GET /:id ──────────────────────────────────────────────────────────────
  router.get('/:id', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as InstallationId;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    assertTenantOwnership(installation, ctx, 'installation', id);

    c.header('Cache-Control', 'no-store');
    return c.json({ data: installation });
  });

  // ── GET /:id/audit-log ────────────────────────────────────────────────────
  //
  // F-S05 patch (F-S11 useAuditLog consume): retorna audit entries cronológicas
  // pra UI (SiteDetailPage + SiteAuditLogPage F-S10). Limit default 50 — MVP
  // single-tenant Diego ≤100/dia, paginação cursor-based fica Onda 1.5.
  router.get('/:id/audit-log', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as InstallationId;
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 50, 200) : 50;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    assertTenantOwnership(installation, ctx, 'installation', id);

    const entries = await storage.listAudit(id, limit);
    return c.json({ data: entries });
  });

  // ── GET /:id/events (SSE) ─────────────────────────────────────────────────
  //
  // F-S12 AC-1 + AC-3 + AC-4 — stream progresso real-time pro modal frontend
  // (`src/components/InstallProgressModal.tsx` em F-S09 + `useInstallTracking`
  // em F-S11).
  //
  // UX source-of-truth: `docs/ux-auto-provisioner-gtm-flow.md` §3 Tela 5
  // (modal step-by-step) + §10.5 (sugestão Dex SSE vs polling).
  // ADR: ainda não há ADR formal pra SSE — F-S12 cria contract de fato.
  //
  // Flow:
  //  1. Auth via authMiddleware (JWT Bearer, F-S05). @todo F-S12 frontend
  //     integration — adicionar `?token` query param fallback pra contornar
  //     limitação browser EventSource (não suporta custom headers). Discussão
  //     em F-S12 §Edge Cases #6.
  //  2. Valida installation existe (404 caso contrário).
  //  3. Loop BRPOP `gtm:events:<id>` com timeout `heartbeatMs / 1000`s:
  //     - evento: `stream.writeSSE({ data: json })`
  //     - timeout: `stream.write(': ping\n\n')` (comment-line ignorado pelo
  //       EventSource browser, mantém connection viva contra Caddy buffer)
  //     - se step terminal (`installed | failed`): close stream.
  //  4. Abort (client disconnect): break loop e fecha — stream.aborted é
  //     setado por `streamSSE` quando ReadableStream cancela.
  router.get('/:id/events', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as InstallationId;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    assertTenantOwnership(installation, ctx, 'installation', id);

    const redis = getRedisClient();
    const key = sseEventsKey(id);

    return streamSSE(c, async (stream) => {
      // Aborta loop quando ReadableStream do client cancela.
      // Note: `streamSSE` helper já cuida de fechar stream no finally.
      while (!stream.aborted && !stream.closed) {
        let payload: string | null;
        try {
          payload = await popEvent(redis, key, heartbeatMs);
        } catch (err) {
          // BRPOP error — log + sleep curto pra evitar busy loop, então tenta de novo.
          // eslint-disable-next-line no-console
          console.error(
            `[sse] popEvent_failed id=${id} msg=${(err as Error).message}`,
          );
          await stream.sleep(500);
          continue;
        }

        if (payload === null) {
          // F-S12 AC-4: heartbeat ping previne timeout proxy (Caddy/Traefik
          // Easypanel). Comment-line SSE (`:`) é ignorado pelo EventSource
          // browser. Mantém connection viva sem mexer em event state.
          await stream.write(': ping\n\n');
          continue;
        }

        // Forward direto do payload do worker (JSON.stringify já feito por
        // publishEvent). writeSSE adiciona `data: ` + `\n\n` final.
        await stream.writeSSE({ data: payload });

        // Steps terminais encerram o stream (F-S12 AC-3 step 4).
        // `pending_activation` (Codex #4 fix) é terminal do deploy MVP: plugin
        // foi subido, aguarda ativação manual no wp-admin + revalidate.
        // `installed`/`failed` legados (futuramente podem voltar quando F-S05+
        // implementar activation HTTP automática, ADR-0008 §3.4).
        try {
          const evt = JSON.parse(payload) as Partial<SseEvent>;
          if (
            evt.step === 'installed' ||
            evt.step === 'failed' ||
            evt.step === 'pending_activation'
          ) {
            break;
          }
        } catch {
          // payload inválido — continua loop, frontend ignora.
        }
      }
    });
  });

  // ── POST /:id/revalidate ──────────────────────────────────────────────────
  //
  // Codex adversarial review #4 fix (2026-05-27): este endpoint agora é o
  // ÚNICO ponto que roda o validator F-S06. Cobre 2 cenários:
  //   1. Post-ativação: install em `uploaded_pending_activation` (deploy ok,
  //      user ativou plugin no wp-admin) → roda validate → `installed | failed`
  //      + `installed_at` se passou.
  //   2. Drift check: install em `installed` → re-roda validate → mantém
  //      `installed` (drift implícito marcado via last_validation_result.passed=false
  //      quando algo mudou no site).
  //
  // Não bloqueia revalidate em outros status (draft, uploading, etc.) por
  // simplicidade — caller pode chamar a qualquer momento, validator é idempotente.
  router.post('/:id/revalidate', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as InstallationId;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    assertTenantOwnership(installation, ctx, 'installation', id);

    // AC-8 step 2 — chama validador 2-stage (F-S06).
    const validate: ValidatorFn = deps.validate ?? runValidator;

    const result = await validate(installation.site_domain, installation.gtm_container_id);

    // story diz "drift_detected" mas o enum GtmInstallation['status'] (Sprint 0
    // lockado) não tem — usa 'failed' com last_validation_result.passed=false
    // marcando drift implicitamente.
    const newStatus: GtmInstallation['status'] = result.passed ? 'installed' : 'failed';

    // Se transição é uploaded_pending_activation → installed, grava installed_at
    // (primeira vez que o site valida). Subsequentes revalidates mantêm o ts
    // original. Se já estava `installed`, não mexe (drift check pode reaprovar).
    const wasFirstInstall =
      installation.status === 'uploaded_pending_activation' && result.passed;
    const installedAt = wasFirstInstall
      ? (new Date().toISOString() as ISO8601)
      : undefined;

    await storage.updateInstallation(id, {
      last_validation_at: new Date().toISOString() as GtmInstallation['last_validation_at'],
      last_validation_result: {
        passed: result.passed,
        stage: result.stage,
        details: result.details as
          | NonNullable<GtmInstallation['last_validation_result']>['details']
          | undefined,
      },
      status: newStatus,
      ...(installedAt ? { installed_at: installedAt } : {}),
    });

    await appendAuditWithSanitization(storage, {
      installation_id: id,
      tenant_id: installation.tenant_id,
      action: result.passed ? 'validation_passed' : 'validation_failed',
      // stage/passed/revalidate não estão na whitelist (ADR-0008 §3.7);
      // wrapper filtra. Dados ricos vivem em last_validation_result typed.
      rawPayload: { site_domain: installation.site_domain },
      actor_user_id: ctx.userId,
      actor_source: 'tracking-api',
    });

    return c.json({
      data: {
        passed: result.passed,
        stage: result.stage,
        details: result.details,
      },
    });
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  router.delete('/:id', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as InstallationId;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    assertTenantOwnership(installation, ctx, 'installation', id);

    // AC-9 step 1 — soft delete (status='uninstalled'); cleanup WP é Onda 1.5.
    await storage.updateInstallation(id, { status: 'uninstalled' });

    await appendAuditWithSanitization(storage, {
      installation_id: id,
      tenant_id: installation.tenant_id,
      action: 'uninstalled',
      // soft_delete não está na whitelist — action='uninstalled' já carrega
      // a semântica. Wrapper retorna {}.
      rawPayload: { site_domain: installation.site_domain },
      actor_user_id: ctx.userId,
      actor_source: 'tracking-api',
    });

    c.header('X-Onda', 'Cleanup WP filesystem é Onda 1.5');
    return c.json({ data: { status: 'uninstalled' } });
  });

  return router;
}

// Default export = router com deps reais.
const installationsRouter = createInstallationsRouter();
export default installationsRouter;
