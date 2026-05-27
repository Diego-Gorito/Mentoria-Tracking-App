/**
 * gtm.ts — Hono router /api/gtm/*
 *
 * Source-of-truth: ADR-0009 §5 (endpoint provision-container).
 *
 * Endpoints (todos autenticados via authMiddleware):
 *   POST   /provision-container   — clone master V2 → tenant. Recebe pixel_ids.
 *                                    Retorna { tenant_id, web_container, server_container, master_version }.
 *   GET    /tenant-container/:tenant_slug
 *                                  — status atual do par web+server do tenant.
 *   GET    /master-versions       — lista versões master disponíveis.
 *   POST   /resume/:tenant_slug   — retoma clone interrompido (TODO Onda 2).
 *
 * @see workers/lib/gtm/provision.ts
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { authMiddleware, getAuthCtx, type AuthContext } from './middleware';
import { supabaseAdmin } from './db';
import { HttpError } from './errors';
import { getRedis } from '../lib/redis';
import { getGtmClient, GtmAuthError, GtmQuotaExceededError } from '../lib/gtm';
import { provisionTenantContainer, ProvisionLockError } from '../lib/gtm/provision';
import type { ProvisionInput } from '../lib/gtm/provision';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const PixelIdsSchema = z
  .object({
    meta: z.string().optional(),
    ga4_web: z.string().optional(),
    ga4_server: z.string().optional(),
    bing: z.string().optional(),
    x: z.string().optional(),
    reddit: z.string().optional(),
    pinterest: z.string().optional(),
    snap: z.string().optional(),
    quora: z.string().optional(),
    clarity: z.string().optional(),
    tiktok: z.string().optional(),
    linkedin: z.string().optional(),
    taboola: z.string().optional(),
    outbrain: z.string().optional(),
    google_ads_conversion: z.string().optional(),
    google_ads_remarketing: z.string().optional(),
  })
  .strict()
  .optional();

const WebhookSecretsSchema = z
  .object({
    kiwify: z.string().min(8).optional(),
    kirvano: z.string().min(8).optional(),
    stripe: z.string().min(8).optional(),
  })
  .strict()
  .optional();

const ProvisionBodySchema = z.object({
  tenant_slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'tenant_slug deve ser lowercase alfanum + hifens'),
  pixel_ids: PixelIdsSchema,
  webhook_secrets: WebhookSecretsSchema,
});

// ─── Vars + DI ────────────────────────────────────────────────────────────────

export type GtmVars = {
  authCtx: AuthContext;
  requestId: string;
};

// ─── Router factory ───────────────────────────────────────────────────────────

export function createGtmRouter(): Hono<{ Variables: GtmVars }> {
  const app = new Hono<{ Variables: GtmVars }>();

  app.use('*', authMiddleware);

  // POST /provision-container — clone master → tenant
  app.post('/provision-container', async (c) => {
    const ctx = getAuthCtx(c);
    const requestId = c.get('requestId') ?? c.req.header('x-request-id') ?? '';

    const json = await c.req.json().catch(() => null);
    const parsed = ProvisionBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(422, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
    }

    // Resolve tenant_id pelo slug (ou pelo authCtx.tenantId se for owner)
    const { data: tenant, error: terr } = await supabaseAdmin
      .schema('core')
      .from('tenants')
      .select('id, slug')
      .eq('slug', parsed.data.tenant_slug)
      .maybeSingle();
    if (terr || !tenant) {
      throw new HttpError(404, 'TENANT_NOT_FOUND', `Tenant ${parsed.data.tenant_slug} não existe`);
    }

    // Authz: user precisa ser gestor/app_admin do tenant
    const { data: link } = await supabaseAdmin
      .schema('core')
      .from('tenant_users')
      .select('role, status')
      .eq('tenant_id', tenant.id)
      .eq('user_id', ctx.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!link || !['gestor', 'app_admin'].includes(link.role)) {
      throw new HttpError(403, 'NOT_TENANT_ADMIN', 'User não é gestor/app_admin desse tenant');
    }

    const input: ProvisionInput = {
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      pixel_ids: parsed.data.pixel_ids,
      webhook_secrets: parsed.data.webhook_secrets,
      request_id: requestId,
    };

    try {
      const result = await provisionTenantContainer(input, {
        gtmClient: getGtmClient(),
        supabase: supabaseAdmin,
        redis: getRedis(),
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof ProvisionLockError) {
        throw new HttpError(409, 'PROVISION_IN_PROGRESS', err.message);
      }
      if (err instanceof GtmQuotaExceededError) {
        throw new HttpError(503, 'GTM_QUOTA_EXCEEDED', 'GTM API quota diária atingida. Tente amanhã.');
      }
      if (err instanceof GtmAuthError) {
        throw new HttpError(500, 'GTM_AUTH_ERROR', 'Service Account GTM key inválida ou sem permissão');
      }
      // Re-throw, errorHandler trata
      throw err;
    }
  });

  // GET /tenant-container/:tenant_slug — status atual
  app.get('/tenant-container/:tenant_slug', async (c) => {
    const ctx = getAuthCtx(c);
    const slug = c.req.param('tenant_slug');

    const { data: tenant } = await supabaseAdmin
      .schema('core')
      .from('tenants')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle();
    if (!tenant) throw new HttpError(404, 'TENANT_NOT_FOUND', `Tenant ${slug} não existe`);

    // RLS já protege — mas double-check authz
    const { data: link } = await supabaseAdmin
      .schema('core')
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', ctx.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) throw new HttpError(403, 'NOT_TENANT_MEMBER', 'User não pertence ao tenant');

    const { data: container } = await supabaseAdmin
      .schema('core')
      .from('tenant_containers')
      .select(`
        id, status, sgtm_url,
        web_container_public_id, web_container_internal_id,
        server_container_public_id, server_container_internal_id,
        created_at, last_published_at, failed_at_step, error_message,
        master_version:gtm_master_versions(version_name, snapshot_at)
      `)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (!container) {
      return c.json({ status: 'not_provisioned', tenant_id: tenant.id }, 200);
    }

    return c.json(container, 200);
  });

  // GET /master-versions — list available master versions
  app.get('/master-versions', async (c) => {
    const { data, error } = await supabaseAdmin
      .schema('core')
      .from('gtm_master_versions')
      .select('id, version_name, snapshot_at, notes, is_current')
      .order('snapshot_at', { ascending: false });
    if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    return c.json({ versions: data ?? [] }, 200);
  });

  return app;
}

const gtmRouter = createGtmRouter();
export default gtmRouter;
