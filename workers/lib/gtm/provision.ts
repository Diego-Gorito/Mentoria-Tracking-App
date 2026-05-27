/**
 * `provision.ts` — Orquestrador do fluxo "clone master V2 → tenant container".
 *
 * ADR-0009 §5.2 pseudocódigo materializado.
 *
 * Steps (cada um persiste audit em core.gtm_clone_audit):
 *  1. init                — valida tenant + master version + lock
 *  2. clone_web           — createContainer(web) + copyContainerContents
 *  3. clone_server        — createContainer(server) + copyContainerContents
 *  4. parametrize         — UPDATE vars [CT] com pixel IDs do tenant
 *  5. link                — UPDATE var [CT] [GTM] Server URL no web container
 *  6. publish_web         — createVersion + publish
 *  7. publish_server      — createVersion + publish
 *  8. persist             — INSERT core.tenant_containers
 *  9. complete            — release lock + final audit
 *
 * Rollback (se falha em qualquer step):
 *  - Audit registra failed_at_step + error
 *  - Containers parciais ficam como "orfãos" → janitor cron limpa depois
 *  - core.tenant_containers fica com status=failed (ou nem é criado)
 *
 * @see ADR-0009 GTM Master Clone Architecture
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Redis as RedisClient } from 'ioredis';

import { GtmApiClient } from './client';
import {
  GtmAuthError,
  GtmConflictError,
  GtmQuotaExceededError,
} from './errors';
import type { CloneStep, GtmVariable } from './types';

// ─── Input/Output types ───────────────────────────────────────────────────────

export interface PixelIdsInput {
  meta?: string;
  ga4_web?: string;
  ga4_server?: string;
  bing?: string;
  x?: string;
  reddit?: string;
  pinterest?: string;
  snap?: string;
  quora?: string;
  clarity?: string;
  tiktok?: string;
  linkedin?: string;
  taboola?: string;
  outbrain?: string;
  google_ads_conversion?: string;
  google_ads_remarketing?: string;
}

export interface WebhookSecretsInput {
  kiwify?: string;
  kirvano?: string;
  stripe?: string;
}

export interface ProvisionInput {
  tenant_id: string;
  tenant_slug: string;
  pixel_ids?: PixelIdsInput;
  webhook_secrets?: WebhookSecretsInput;
  request_id?: string;
}

export interface ProvisionResult {
  tenant_id: string;
  web_container: {
    public_id: string;
    internal_id: string;
    snippet: string;
  };
  server_container: {
    public_id: string;
    internal_id: string;
    url: string;
  };
  master_version: string;
}

export interface ProvisionDeps {
  gtmClient: GtmApiClient;
  supabase: SupabaseClient;
  redis: RedisClient;
  /** Audit callback — chamado a cada step. Default: INSERT em core.gtm_clone_audit. */
  onStep?: (step: ProvisionStep, payload: ProvisionStepPayload) => Promise<void>;
  /** GTM account ID destino (default env GTM_ACCOUNT_ID). */
  gtmAccountId?: string;
  /** Base URL sGTM (default env GTM_SERVER_BASE_URL). */
  sgtmBaseUrl?: string;
  /** Lock TTL (default 600s = 10min). */
  lockTtlSec?: number;
}

export type ProvisionStep =
  | 'init'
  | 'clone_web'
  | 'clone_server'
  | 'parametrize'
  | 'link'
  | 'publish_web'
  | 'publish_server'
  | 'persist'
  | 'complete'
  | 'failed';

export interface ProvisionStepPayload {
  status: 'in_progress' | 'success' | 'failed';
  detail?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: unknown;
}

// ─── Lock + audit helpers ─────────────────────────────────────────────────────

const LOCK_KEY = (tenantId: string) => `gtm:provision:lock:${tenantId}`;
const DEFAULT_LOCK_TTL = 600;

class ProvisionLockError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Provision em andamento pra tenant ${tenantId}`);
    this.name = 'ProvisionLockError';
  }
}

async function acquireLock(
  redis: RedisClient,
  tenantId: string,
  ttlSec: number,
  requestId: string,
): Promise<void> {
  const ok = await redis.set(LOCK_KEY(tenantId), requestId, 'EX', ttlSec, 'NX');
  if (ok !== 'OK') throw new ProvisionLockError(tenantId);
}

async function releaseLock(redis: RedisClient, tenantId: string): Promise<void> {
  await redis.del(LOCK_KEY(tenantId));
}

// ─── Pixel ID → variable mapping ──────────────────────────────────────────────

/**
 * Mapeia campo do input → nome da variable [CT] no GTM master.
 * Caller cria UPDATE PUT pra cada um quando user supre.
 */
const PIXEL_VAR_MAP: Record<keyof PixelIdsInput, string> = {
  meta: '[CT] [Meta Ads] Pixel ID',
  ga4_web: '[CT] [GA4] Fluxo de Dados | ID da Métrica',
  ga4_server: '[CT] [GA4] Setup de Eventos',
  bing: '[CT] [Bing UET] Tag ID',
  x: '[CT] [X Ads] Pixel ID',
  reddit: '[CT] [Reddit] Pixel ID',
  pinterest: '[CT] [Pinterest] Tag ID',
  snap: '[CT] [Snap] Pixel ID',
  quora: '[CT] [Quora] Pixel ID',
  clarity: '[CT] [Clarity] Project ID',
  tiktok: '[CT] [TikTok] Pixel ID',
  linkedin: '[CT] [LinkedIn] Insight Tag ID',
  taboola: '[CT] [Taboola] Pixel ID',
  outbrain: '[CT] [Outbrain] Pixel ID',
  google_ads_conversion: '[CT] [G Ads] ID de Conversão',
  google_ads_remarketing: '[CT] [G Ads] ID da Tag',
};

const SERVER_URL_VAR_NAME = '[CT] [GTM] Server URL';

// ─── Main orchestrator ───────────────────────────────────────────────────────

export async function provisionTenantContainer(
  input: ProvisionInput,
  deps: ProvisionDeps,
): Promise<ProvisionResult> {
  const startedAt = Date.now();
  const requestId = input.request_id ?? `prov-${Date.now()}`;
  const tenantId = input.tenant_id;
  const lockTtl = deps.lockTtlSec ?? DEFAULT_LOCK_TTL;
  const gtmAccountId = deps.gtmAccountId ?? process.env.GTM_ACCOUNT_ID ?? '6059193756';
  const sgtmBaseUrl =
    deps.sgtmBaseUrl ?? process.env.GTM_SERVER_BASE_URL ?? 'https://sgtm.colegiomentoria.com.br';

  const onStep =
    deps.onStep ??
    (async (step, payload) => {
      // Default audit: INSERT em core.gtm_clone_audit
      await deps.supabase.from('gtm_clone_audit').insert({
        tenant_id: tenantId,
        action: 'provision',
        step,
        status: payload.status,
        request_id: requestId,
        duration_ms: payload.durationMs,
        error: payload.error ? sanitizeError(payload.error) : null,
        metadata: payload.metadata ?? {},
      });
    });

  // Step 1: init
  await acquireLock(deps.redis, tenantId, lockTtl, requestId);
  try {
    await onStep('init', { status: 'in_progress' });

    // Check tenant_containers UNIQUE
    const { data: existing } = await deps.supabase
      .schema('core')
      .from('tenant_containers')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (existing) {
      throw new Error(
        `Tenant ${tenantId} já tem container (status=${existing.status}). Use republish endpoint.`,
      );
    }

    // Get current master version
    const { data: master, error: masterErr } = await deps.supabase
      .schema('core')
      .from('gtm_master_versions')
      .select('*')
      .eq('is_current', true)
      .maybeSingle();
    if (masterErr || !master) {
      throw new Error(`No current master version found: ${masterErr?.message ?? 'no row'}`);
    }
    await onStep('init', {
      status: 'success',
      detail: `master=${master.version_name}`,
      metadata: { master_version: master.version_name },
    });

    // Step 2: clone web container
    const cloneWebStart = Date.now();
    await onStep('clone_web', { status: 'in_progress' });
    const webContainer = await deps.gtmClient.createContainer(
      gtmAccountId,
      `${input.tenant_slug}-web`,
      ['web'],
    );
    const webTargetWs = await deps.gtmClient.getDefaultWorkspaceId(
      gtmAccountId,
      webContainer.containerId,
    );
    const webClone = await deps.gtmClient.copyContainerContents({
      sourceAccountId: gtmAccountId,
      sourceContainerId: master.web_master_internal_id,
      sourceWorkspaceId: master.web_master_workspace_id,
      targetAccountId: gtmAccountId,
      targetContainerId: webContainer.containerId,
      targetWorkspaceId: webTargetWs,
    });
    await onStep('clone_web', {
      status: 'success',
      durationMs: Date.now() - cloneWebStart,
      metadata: {
        web_container_id: webContainer.containerId,
        web_container_public_id: webContainer.publicId,
        copied_counts: webClone.copiedCounts,
      },
    });

    // Step 3: clone server container
    const cloneServerStart = Date.now();
    await onStep('clone_server', { status: 'in_progress' });
    const serverContainer = await deps.gtmClient.createContainer(
      gtmAccountId,
      `${input.tenant_slug}-server`,
      ['server'],
    );
    const serverTargetWs = await deps.gtmClient.getDefaultWorkspaceId(
      gtmAccountId,
      serverContainer.containerId,
    );
    const serverClone = await deps.gtmClient.copyContainerContents({
      sourceAccountId: gtmAccountId,
      sourceContainerId: master.server_master_internal_id,
      sourceWorkspaceId: master.server_master_workspace_id,
      targetAccountId: gtmAccountId,
      targetContainerId: serverContainer.containerId,
      targetWorkspaceId: serverTargetWs,
    });
    await onStep('clone_server', {
      status: 'success',
      durationMs: Date.now() - cloneServerStart,
      metadata: {
        server_container_id: serverContainer.containerId,
        server_container_public_id: serverContainer.publicId,
        copied_counts: serverClone.copiedCounts,
      },
    });

    // Step 4: parametrize pixel IDs no web container
    if (input.pixel_ids && Object.keys(input.pixel_ids).length > 0) {
      const paramStart = Date.now();
      await onStep('parametrize', { status: 'in_progress' });
      await updateWebPixelVars(
        deps.gtmClient,
        gtmAccountId,
        webContainer.containerId,
        webTargetWs,
        input.pixel_ids,
      );
      await onStep('parametrize', {
        status: 'success',
        durationMs: Date.now() - paramStart,
        metadata: { fields: Object.keys(input.pixel_ids) },
      });
    }

    // Step 5: link web → server URL
    const linkStart = Date.now();
    await onStep('link', { status: 'in_progress' });
    const sgtmUrl = `${sgtmBaseUrl}/${input.tenant_slug}`;
    await updateVariableByName(
      deps.gtmClient,
      gtmAccountId,
      webContainer.containerId,
      webTargetWs,
      SERVER_URL_VAR_NAME,
      sgtmUrl,
      { skipIfMissing: true },
    );
    await onStep('link', {
      status: 'success',
      durationMs: Date.now() - linkStart,
      metadata: { sgtm_url: sgtmUrl },
    });

    // Step 6: publish web version
    const pubWebStart = Date.now();
    await onStep('publish_web', { status: 'in_progress' });
    const webVer = await deps.gtmClient.createVersion(
      gtmAccountId,
      webContainer.containerId,
      webTargetWs,
      `v1 — initial provision (master ${master.version_name})`,
      `Tenant: ${input.tenant_slug} | request_id: ${requestId}`,
    );
    await deps.gtmClient.publishVersion(
      gtmAccountId,
      webContainer.containerId,
      webVer.containerVersionId,
    );
    await onStep('publish_web', {
      status: 'success',
      durationMs: Date.now() - pubWebStart,
      metadata: { version_id: webVer.containerVersionId },
    });

    // Step 7: publish server version
    const pubServerStart = Date.now();
    await onStep('publish_server', { status: 'in_progress' });
    const serverVer = await deps.gtmClient.createVersion(
      gtmAccountId,
      serverContainer.containerId,
      serverTargetWs,
      `v1 — initial provision (master ${master.version_name})`,
      `Tenant: ${input.tenant_slug} | request_id: ${requestId}`,
    );
    await deps.gtmClient.publishVersion(
      gtmAccountId,
      serverContainer.containerId,
      serverVer.containerVersionId,
    );
    await onStep('publish_server', {
      status: 'success',
      durationMs: Date.now() - pubServerStart,
      metadata: { version_id: serverVer.containerVersionId },
    });

    // Step 8: persist tenant_containers + pixel_secrets + webhook_secrets
    const persistStart = Date.now();
    await onStep('persist', { status: 'in_progress' });

    const { error: insertErr } = await deps.supabase
      .schema('core')
      .from('tenant_containers')
      .insert({
        tenant_id: tenantId,
        gtm_account_id: gtmAccountId,
        web_container_public_id: webContainer.publicId,
        web_container_internal_id: webContainer.containerId,
        server_container_public_id: serverContainer.publicId,
        server_container_internal_id: serverContainer.containerId,
        master_version_id: master.id,
        sgtm_url: sgtmUrl,
        status: 'active',
        last_published_at: new Date().toISOString(),
      });
    if (insertErr) throw new Error(`Persist tenant_containers failed: ${insertErr.message}`);

    if (input.pixel_ids && Object.keys(input.pixel_ids).length > 0) {
      const rows = Object.entries(input.pixel_ids)
        .filter(([, v]) => v)
        .map(([platform, pixel_id]) => ({
          tenant_id: tenantId,
          platform: platformFieldToColumn(platform as keyof PixelIdsInput),
          pixel_id: pixel_id as string,
        }));
      if (rows.length > 0) {
        await deps.supabase.schema('core').from('tenant_pixel_secrets').insert(rows);
      }
    }
    // NOTE: webhook_secrets vão pra vault.create_secret() + insert.
    // MVP: skip — Diego configura via UI próprio futuramente.

    await onStep('persist', {
      status: 'success',
      durationMs: Date.now() - persistStart,
    });

    // Step 9: complete
    await onStep('complete', {
      status: 'success',
      durationMs: Date.now() - startedAt,
      metadata: {
        web_container_public_id: webContainer.publicId,
        server_container_public_id: serverContainer.publicId,
      },
    });

    return {
      tenant_id: tenantId,
      web_container: {
        public_id: webContainer.publicId,
        internal_id: webContainer.containerId,
        snippet: generateGtmSnippet(webContainer.publicId),
      },
      server_container: {
        public_id: serverContainer.publicId,
        internal_id: serverContainer.containerId,
        url: sgtmUrl,
      },
      master_version: master.version_name,
    };
  } catch (err) {
    await onStep('failed', {
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: err,
    });
    throw err;
  } finally {
    await releaseLock(deps.redis, tenantId);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateWebPixelVars(
  client: GtmApiClient,
  accountId: string,
  containerId: string,
  workspaceId: string,
  pixelIds: PixelIdsInput,
): Promise<void> {
  const allVars = await client.listVariables(accountId, containerId, workspaceId);

  for (const [field, value] of Object.entries(pixelIds)) {
    if (!value) continue;
    const varName = PIXEL_VAR_MAP[field as keyof PixelIdsInput];
    if (!varName) continue;
    const v = allVars.find((x) => x.name === varName);
    if (!v || !v.variableId) continue; // var não existe no master (ainda)
    // Update value (assume var é tipo 'c' = constant com parameter[0].key='value')
    const updated: Partial<GtmVariable> = {
      name: v.name,
      type: v.type,
      parameter: v.parameter?.map((p) =>
        p.key === 'value' ? { ...p, value: String(value) } : p,
      ),
    };
    await client.updateVariable(accountId, containerId, workspaceId, v.variableId, updated);
  }
}

async function updateVariableByName(
  client: GtmApiClient,
  accountId: string,
  containerId: string,
  workspaceId: string,
  name: string,
  newValue: string,
  opts: { skipIfMissing?: boolean } = {},
): Promise<void> {
  const allVars = await client.listVariables(accountId, containerId, workspaceId);
  const v = allVars.find((x) => x.name === name);
  if (!v || !v.variableId) {
    if (opts.skipIfMissing) return;
    throw new Error(`Variable not found: ${name}`);
  }
  await client.updateVariable(accountId, containerId, workspaceId, v.variableId, {
    name: v.name,
    type: v.type,
    parameter: v.parameter?.map((p) =>
      p.key === 'value' ? { ...p, value: newValue } : p,
    ),
  });
}

function generateGtmSnippet(publicId: string): string {
  return `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${publicId}');</script>
<!-- End Google Tag Manager -->`;
}

function platformFieldToColumn(field: keyof PixelIdsInput): string {
  // Match DB CHECK constraint values from migration 0252
  const map: Record<keyof PixelIdsInput, string> = {
    meta: 'meta',
    ga4_web: 'ga4_web',
    ga4_server: 'ga4_server',
    bing: 'bing',
    x: 'x',
    reddit: 'reddit',
    pinterest: 'pinterest',
    snap: 'snap',
    quora: 'quora',
    clarity: 'clarity',
    tiktok: 'tiktok',
    linkedin: 'linkedin',
    taboola: 'taboola',
    outbrain: 'outbrain',
    google_ads_conversion: 'google_ads_conversion',
    google_ads_remarketing: 'google_ads_remarketing',
  };
  return map[field];
}

function sanitizeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // stack omitted (potencialmente sensível em prod logs)
    };
  }
  return { value: String(err) };
}

export { ProvisionLockError };
