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
import { z } from 'zod';

import { authMiddleware, getAuthCtx, type AuthContext } from './middleware';
import { getStorage, type IGtmStorage } from '../lib/storage';
import { sealDecrypt } from '../lib/storage/crypto';
import { getProvider, type IHostingProvider } from '../lib/providers';
import type {
  AccountId,
  GtmInstallation,
  HostingAccount,
  InstallationId,
  TenantId,
} from '../lib/storage/types';
import {
  BRAND_GTM_MAP,
  DEFAULT_PLUGIN_VERSION,
  MENTORIA_TENANT_ID,
  isBrandSlug,
  type BrandSlug,
} from '../lib/constants';
import { LockConflictError, NotFoundError } from './errors';
import { deployJob, type DeployJobDeps } from './deployJob';
import { validate as runValidator } from '../lib/validator';
import { appendAuditWithSanitization } from '../lib/audit';

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
  /** Override do validator (testes). */
  validate?: DeployJobDeps['validate'];
  /** Override do buildPlugin (testes). */
  buildPlugin?: DeployJobDeps['buildPlugin'];
}

// ---------- helpers ----------

function resolveTenantId(_ctx: AuthContext): TenantId {
  return MENTORIA_TENANT_ID;
}

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
      // setImmediate pra MVP — Onda 1.5 swap por BullMQ/Queue
      setImmediate(() => {
        void deployJob(id, jobDeps);
      });
    });

  router.use('*', auth);

  // ── POST / ────────────────────────────────────────────────────────────────
  router.post('/', async (c) => {
    const ctx = getAuthCtx(c);
    const raw = await c.req.json();
    const input = CreateInstallationSchema.parse(raw); // ZodError → 422

    const storage = getStorageInstance();

    // Verifica que a hosting_account_id pertence ao tenant (sanity check).
    const account = await storage.getAccount(input.hosting_account_id as AccountId);
    if (!account) {
      throw new NotFoundError('hosting_account', input.hosting_account_id);
    }

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
    if (!installation) {
      throw new NotFoundError('installation', id);
    }

    // AC-6 step 1 — distributed lock (60s TTL).
    const acquired = await storage.acquireLock(id, 60);
    if (!acquired) {
      throw new LockConflictError();
    }

    // Resolve account agora (validação cedo se account sumiu).
    const account = await storage.getAccount(installation.hosting_account_id);
    if (!account) {
      // libera lock antes de throw — caller perdeu race com delete.
      await storage.releaseLock(id);
      throw new NotFoundError('hosting_account', installation.hosting_account_id);
    }

    // AC-6 step 2 — dispara worker async via setImmediate (ou override em tests).
    const jobDeps: DeployJobDeps = {
      storage,
      getProvider: async (_inst) => buildProviderForAccount(account, getProviderFn),
      buildPlugin: deps.buildPlugin,
      validate: deps.validate,
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
    const id = c.req.param('id') as InstallationId;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    if (!installation) {
      throw new NotFoundError('installation', id);
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: installation });
  });

  // ── POST /:id/revalidate ──────────────────────────────────────────────────
  router.post('/:id/revalidate', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as InstallationId;
    const storage = getStorageInstance();

    const installation = await storage.getInstallation(id);
    if (!installation) {
      throw new NotFoundError('installation', id);
    }

    // AC-8 step 2 — chama validador 2-stage (F-S06).
    const validate: NonNullable<DeployJobDeps['validate']> = deps.validate ?? runValidator;

    const result = await validate(installation.site_domain, installation.gtm_container_id);

    // story diz "drift_detected" mas o enum GtmInstallation['status'] (Sprint 0
    // lockado) não tem — usa 'failed' com last_validation_result.passed=false
    // marcando drift implicitamente.
    const newStatus: GtmInstallation['status'] = result.passed ? 'installed' : 'failed';

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
    if (!installation) {
      throw new NotFoundError('installation', id);
    }

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
