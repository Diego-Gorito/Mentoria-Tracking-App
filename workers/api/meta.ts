/**
 * meta.ts — Hono router /api/meta/*
 *
 * Conector Meta (Facebook) Ads via "System User Token paste" (MVP sem OAuth).
 * O cliente gera um System User access token long-lived no Business Manager
 * (guia no frontend), cola na UI, e a gente lista ad accounts + pixels via
 * Graph API v21.0 pra popular a var [CT] [Meta Ads] Pixel ID do container GTM.
 *
 * Endpoints (todos via authMiddleware + resolveTenantId + assertTenantOwnership):
 *   POST   /connect       — valida token, cifra (libsodium), upsert row → ad accounts
 *   GET    /ad-accounts   — decifra token guardado, lista ad accounts (re-fetch)
 *   GET    /pixels        — decifra token, lista pixels de ?ad_account_id=
 *   POST   /select        — grava ad_account/pixel + escreve pixel no container GTM
 *   GET    /status        — estado atual da conexão (sem token)
 *   DELETE /disconnect    — status=revoked (+ opcional delete da row)
 *
 * SEGURANÇA:
 *   - token cifrado com sealEncrypt() antes de gravar (token_encrypted). NUNCA
 *     retornado pro client (publicView faz strip). NUNCA logado.
 *   - writes via supabaseAdmin (service_role). SELECT escopado ao tenant do JWT.
 *
 * MECANISMO "select → container recebe pixel": targeted var update via
 * updateTenantMetaPixel (NÃO republish — republish preserva o value das vars
 * [CT]). Vide workers/lib/meta/pixelVar.ts.
 *
 * @see supabase/migrations/0260_core_tenant_integrations_meta.sql
 * @see workers/lib/gtm/provision.ts (PIXEL_VAR_MAP / updateWebPixelVars)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { authMiddleware, getAuthCtx, type AuthContext } from './middleware';
import { supabaseAdmin } from './db';
import { HttpError } from './errors';
import { resolveTenantId } from './tenantGuard';
import { sealEncrypt, sealDecrypt } from '../lib/storage/crypto';
import { getMetaClient, MetaClient, type MetaAdAccount } from '../lib/meta';
import { updateTenantMetaPixel } from '../lib/meta';
import { getGtmClient, GtmApiClient } from '../lib/gtm';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ConnectBodySchema = z.object({
  token: z.string().min(20, 'token muito curto'),
});

const SelectBodySchema = z.object({
  ad_account_id: z.string().min(2),
  pixel_id: z.string().min(1),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetaVars = {
  authCtx: AuthContext;
  requestId: string;
};

interface MetaIntegrationRow {
  id: string;
  tenant_id: string;
  token_encrypted: string;
  business_id: string | null;
  ad_account_id: string | null;
  pixel_id: string | null;
  status: string;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
}

/** View pública — NUNCA inclui token_encrypted. */
interface MetaStatusView {
  connected: boolean;
  business_id: string | null;
  ad_account_id: string | null;
  pixel_id: string | null;
  status: string | null;
}

export interface MetaRouterDeps {
  /** Override do Supabase admin client (testes). Default: supabaseAdmin real. */
  supabase?: SupabaseClient;
  /** Factory do MetaClient (testes injetam fetch mock). Default: getMetaClient. */
  metaClientFactory?: () => MetaClient;
  /** GTM client pra gravar o pixel no container (testes mockam). Default: getGtmClient. */
  gtmClient?: GtmApiClient;
  /** Override do middleware de auth (testes bypassam). Default: middleware real. */
  authOverride?: (
    c: Parameters<typeof authMiddleware>[0],
    n: Parameters<typeof authMiddleware>[1],
  ) => Promise<Response | void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusView(row: MetaIntegrationRow | null): MetaStatusView {
  if (!row || row.status === 'revoked') {
    return { connected: false, business_id: null, ad_account_id: null, pixel_id: null, status: row?.status ?? null };
  }
  return {
    connected: row.status === 'connected',
    business_id: row.business_id,
    ad_account_id: row.ad_account_id,
    pixel_id: row.pixel_id,
    status: row.status,
  };
}

function requireEncryptionKeys(): { publicKey: string; secretKey: string } {
  const publicKey = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY;
  const secretKey = process.env.STORAGE_ENCRYPTION_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new HttpError(
      500,
      'ENCRYPTION_KEY_MISSING',
      'STORAGE_ENCRYPTION_PUBLIC_KEY/SECRET_KEY ausentes — boot deve ter chamado assertEnv()',
    );
  }
  return { publicKey, secretKey };
}

/** Pega a row Meta do tenant via service_role. */
async function fetchRow(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MetaIntegrationRow | null> {
  const { data, error } = await supabase
    .schema('core')
    .from('tenant_integrations_meta')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    throw new HttpError(500, 'DB_ERROR', `Falha ao ler conexão Meta: ${error.message}`);
  }
  return (data as MetaIntegrationRow | null) ?? null;
}

/** Decifra o token guardado da row do tenant, ou 404/409 se ausente/revogado. */
async function loadToken(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ row: MetaIntegrationRow; token: string }> {
  const row = await fetchRow(supabase, tenantId);
  if (!row) {
    throw new HttpError(404, 'META_NOT_CONNECTED', 'Nenhuma conexão Meta pra esse tenant');
  }
  if (row.status === 'revoked') {
    throw new HttpError(409, 'META_REVOKED', 'Conexão Meta foi revogada — conecte novamente');
  }
  const { publicKey, secretKey } = requireEncryptionKeys();
  let token: string;
  try {
    token = await sealDecrypt(row.token_encrypted, publicKey, secretKey);
  } catch {
    throw new HttpError(500, 'TOKEN_DECRYPT_FAILED', 'Falha ao decifrar token Meta (key mismatch?)');
  }
  return { row, token };
}

// ─── Router factory ───────────────────────────────────────────────────────────

export function createMetaRouter(deps: MetaRouterDeps = {}): Hono<{ Variables: MetaVars }> {
  const app = new Hono<{ Variables: MetaVars }>();

  const supabase = deps.supabase ?? supabaseAdmin;
  const makeMetaClient = deps.metaClientFactory ?? (() => getMetaClient());
  const getGtm = () => deps.gtmClient ?? getGtmClient();
  const auth = deps.authOverride ?? authMiddleware;

  app.use('*', auth);

  // ── POST /connect ─────────────────────────────────────────────────────────
  // Valida token via Graph /me, cifra, upsert row (status=connected). Retorna
  // business_id + ad accounts. NÃO grava ad_account/pixel ainda (próximo step).
  app.post('/connect', async (c) => {
    const ctx = getAuthCtx(c);
    const tenantId = resolveTenantId(ctx);
    const raw = await c.req.json().catch(() => null);
    const input = ConnectBodySchema.parse(raw); // ZodError → 422

    const client = makeMetaClient();
    // Valida token (lança MetaTokenInvalidError → 401 via errorHandler).
    await client.validateToken(input.token);
    // Lista ad accounts já aqui pra UI seguir direto pro step de seleção.
    const adAccounts = await client.listAdAccounts(input.token);
    const businessId = pickBusinessId(adAccounts);

    const { publicKey } = requireEncryptionKeys();
    const tokenEncrypted = await sealEncrypt(input.token, publicKey);

    // Upsert por tenant_id (UNIQUE). onConflict preserva ad_account/pixel? Não:
    // ao reconectar com token novo, zera a seleção pra forçar re-seleção (token
    // pode ter outro escopo de contas). status volta pra connected.
    const { error: upErr } = await supabase
      .schema('core')
      .from('tenant_integrations_meta')
      .upsert(
        {
          tenant_id: tenantId,
          token_encrypted: tokenEncrypted,
          business_id: businessId,
          ad_account_id: null,
          pixel_id: null,
          status: 'connected',
          connected_by: ctx.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' },
      );
    if (upErr) {
      throw new HttpError(500, 'DB_ERROR', `Falha ao salvar conexão Meta: ${upErr.message}`);
    }

    console.log(`[meta] connect tenant=${tenantId} user=${ctx.userId} ad_accounts=${adAccounts.length}`);

    return c.json(
      {
        business_id: businessId,
        ad_accounts: adAccounts.map(publicAdAccount),
      },
      201,
    );
  });

  // ── GET /ad-accounts ────────────────────────────────────────────────────────
  app.get('/ad-accounts', async (c) => {
    const ctx = getAuthCtx(c);
    const tenantId = resolveTenantId(ctx);
    const { token } = await loadToken(supabase, tenantId);

    const client = makeMetaClient();
    const adAccounts = await client.listAdAccounts(token);
    return c.json({ ad_accounts: adAccounts.map(publicAdAccount) });
  });

  // ── GET /pixels?ad_account_id= ──────────────────────────────────────────────
  app.get('/pixels', async (c) => {
    const ctx = getAuthCtx(c);
    const tenantId = resolveTenantId(ctx);
    const adAccountId = c.req.query('ad_account_id');
    if (!adAccountId) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Query param ad_account_id obrigatório');
    }
    const { token } = await loadToken(supabase, tenantId);

    const client = makeMetaClient();
    const pixels = await client.listPixels(token, adAccountId);
    return c.json({ pixels });
  });

  // ── POST /select ────────────────────────────────────────────────────────────
  // Grava ad_account + pixel na row, depois escreve o pixel na var
  // [CT] [Meta Ads] Pixel ID do container web do tenant (targeted update +
  // publish). Se o tenant ainda não tem container provisionado, grava a seleção
  // e avisa via `container_synced:false` (sem falhar).
  app.post('/select', async (c) => {
    const ctx = getAuthCtx(c);
    const tenantId = resolveTenantId(ctx);
    const requestId = c.get('requestId') ?? c.req.header('x-request-id') ?? '';
    const raw = await c.req.json().catch(() => null);
    const input = SelectBodySchema.parse(raw); // ZodError → 422

    // Precisa estar conectado (token válido guardado).
    const row = await fetchRow(supabase, tenantId);
    if (!row) {
      throw new HttpError(404, 'META_NOT_CONNECTED', 'Conecte o Meta antes de selecionar conta/pixel');
    }
    if (row.status === 'revoked') {
      throw new HttpError(409, 'META_REVOKED', 'Conexão Meta revogada — conecte novamente');
    }

    // 1. Persistir seleção.
    const { error: updErr } = await supabase
      .schema('core')
      .from('tenant_integrations_meta')
      .update({
        ad_account_id: input.ad_account_id,
        pixel_id: input.pixel_id,
        status: 'connected',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);
    if (updErr) {
      throw new HttpError(500, 'DB_ERROR', `Falha ao salvar seleção Meta: ${updErr.message}`);
    }

    // 1b. Espelha o pixel em core.tenant_pixel_secrets (fonte canônica de pixels
    // per-tenant; provision/republish lê dali). Upsert por (tenant_id, platform).
    const { error: secErr } = await supabase
      .schema('core')
      .from('tenant_pixel_secrets')
      .upsert(
        {
          tenant_id: tenantId,
          platform: 'meta',
          pixel_id: input.pixel_id,
          enabled: true,
        },
        { onConflict: 'tenant_id,platform' },
      );
    if (secErr) {
      // Não fatal — log e segue. O update da var do container é o que importa pro
      // tracking funcionar agora.
      console.warn(`[meta] tenant_pixel_secrets upsert falhou tenant=${tenantId}: ${secErr.message}`);
    }

    // 2. Escrever o pixel na var do container web (se houver container).
    const { data: container } = await supabase
      .schema('core')
      .from('tenant_containers')
      .select('web_container_internal_id, status')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let containerSynced = false;
    let syncDetail: string | undefined;
    const webInternalId = (container as { web_container_internal_id?: string } | null)?.web_container_internal_id;
    if (webInternalId) {
      try {
        const result = await updateTenantMetaPixel(getGtm(), {
          webContainerInternalId: webInternalId,
          pixelId: input.pixel_id,
          requestId,
        });
        containerSynced = result.updated;
        syncDetail = result.reason;
        console.log(
          `[meta] select tenant=${tenantId} pixel=${input.pixel_id} container_synced=${containerSynced}` +
            (result.versionId ? ` version=${result.versionId}` : '') +
            (result.reason ? ` reason=${result.reason}` : ''),
        );
      } catch (err) {
        // Falha no GTM NÃO derruba a seleção (já persistida). Reporta no body.
        syncDetail = err instanceof Error ? err.message : String(err);
        console.error(`[meta] select container_sync_failed tenant=${tenantId} err=${syncDetail.slice(0, 200)}`);
      }
    } else {
      syncDetail = 'Tenant sem container GTM provisionado — pixel salvo, será aplicado no provision';
      console.log(`[meta] select tenant=${tenantId} pixel=${input.pixel_id} no_container`);
    }

    return c.json(
      {
        ad_account_id: input.ad_account_id,
        pixel_id: input.pixel_id,
        container_synced: containerSynced,
        detail: syncDetail,
      },
      200,
    );
  });

  // ── GET /status ─────────────────────────────────────────────────────────────
  app.get('/status', async (c) => {
    const ctx = getAuthCtx(c);
    const tenantId = resolveTenantId(ctx);
    const row = await fetchRow(supabase, tenantId);
    return c.json(statusView(row));
  });

  // ── DELETE /disconnect ──────────────────────────────────────────────────────
  // Soft-revoke por padrão (status=revoked, zera token pra não decifrar lixo).
  // ?hard=1 deleta a row.
  app.delete('/disconnect', async (c) => {
    const ctx = getAuthCtx(c);
    const tenantId = resolveTenantId(ctx);
    const hard = c.req.query('hard') === '1';

    if (hard) {
      const { error } = await supabase
        .schema('core')
        .from('tenant_integrations_meta')
        .delete()
        .eq('tenant_id', tenantId);
      if (error) throw new HttpError(500, 'DB_ERROR', `Falha ao deletar conexão Meta: ${error.message}`);
      console.log(`[meta] disconnect(hard) tenant=${tenantId}`);
      return c.body(null, 204);
    }

    const { error } = await supabase
      .schema('core')
      .from('tenant_integrations_meta')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);
    if (error) throw new HttpError(500, 'DB_ERROR', `Falha ao revogar conexão Meta: ${error.message}`);
    console.log(`[meta] disconnect(soft) tenant=${tenantId}`);
    return c.json({ status: 'revoked' });
  });

  return app;
}

// ─── Small pure helpers ─────────────────────────────────────────────────────

/** Strip de campos internos pro client (nunca expõe nada sensível — só id/name/status). */
function publicAdAccount(a: MetaAdAccount): { id: string; name: string; status: number; business_id: string | null } {
  return { id: a.id, name: a.name, status: a.status, business_id: a.business_id };
}

/** Primeiro business_id não-nulo das ad accounts (heurística pro Business Manager). */
function pickBusinessId(accounts: MetaAdAccount[]): string | null {
  for (const a of accounts) {
    if (a.business_id) return a.business_id;
  }
  return null;
}

// Default export = router com deps reais.
const metaRouter = createMetaRouter();
export default metaRouter;
