/**
 * hosting-accounts.ts — Hono router /api/hosting-accounts/*
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-1, AC-2, AC-3 + AC-10 (response shape).
 *
 * Endpoints (todos protegidos por authMiddleware via mount em index.ts):
 *   POST   /                — AC-1: cria conta + valida token via pingToken
 *   GET    /                — AC-2: lista accounts do tenant (sem token_encrypted)
 *   DELETE /:id             — AC-3: hard delete da account (preserva audit)
 *
 * Encryption: tokens são cifrados via libsodium sealed box (F-S02) usando
 * STORAGE_ENCRYPTION_PUBLIC_KEY antes de gravar no Redis. token_encrypted
 * NUNCA é retornado em response (AC-1 step 4 + AC-2 step 2).
 *
 * Provider validation: `pingToken()` (F-S04) é chamado antes de persistir
 * a account. Se token rejeitado → TokenInvalidError → errorHandler 401.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { authMiddleware, getAuthCtx, type AuthContext } from './middleware';
import { getStorage, type IGtmStorage } from '../lib/storage';
import type { AccountId, HostingAccount, TenantId } from '../lib/storage/types';
import { sealEncrypt } from '../lib/storage/crypto';
import { getProvider, type IHostingProvider } from '../lib/providers';
import { TokenInvalidError } from '../lib/providers/errors';
import { MENTORIA_TENANT_ID } from '../lib/constants';
import { NotFoundError } from './errors';

// ---------- Zod schemas ----------

const CreateHostingAccountSchema = z.object({
  provider: z.literal('hostinger'),
  token: z.string().min(8, 'token muito curto'),
  label: z.string().min(1).max(120),
  account_email: z.string().email().optional(),
  wp_admin_password: z.string().min(1).optional(),
});

// ---------- Vars + DI ----------

export type HostingAccountsVars = {
  authCtx: AuthContext;
  requestId: string;
  /** Override em testes — default usa env. */
  storage?: IGtmStorage;
  /** Override em testes — default usa factory real. */
  providerFactory?: typeof getProvider;
};

interface HostingAccountsDeps {
  /** Permite injetar storage in-memory nos testes. */
  storage?: IGtmStorage;
  /** Permite injetar MockProvider nos testes. */
  providerFactory?: (
    type: 'hostinger',
    creds: { token: string; wpAdminPassword?: string },
  ) => IHostingProvider;
  /**
   * Override do middleware de auth (testes bypassam via c.set('authCtx', ...))
   * Default: middleware real Supabase.
   */
  authOverride?: (c: Parameters<typeof authMiddleware>[0], n: Parameters<typeof authMiddleware>[1]) => Promise<Response | void>;
}

// ---------- helpers ----------

/** Strip campos sensíveis antes de devolver pro client (AC-1 + AC-2). */
function publicAccountView(acc: HostingAccount): Omit<HostingAccount, 'token_encrypted' | 'wp_admin_creds_encrypted'> {
  const { token_encrypted, wp_admin_creds_encrypted, ...rest } = acc;
  void token_encrypted;
  void wp_admin_creds_encrypted;
  return rest;
}

/** Resolve tenant_id — single-tenant MVP usa const fixo (F-S14 troca pelo real). */
function resolveTenantId(_ctx: AuthContext): TenantId {
  return MENTORIA_TENANT_ID;
}

// ---------- factory ----------

export function createHostingAccountsRouter(deps: HostingAccountsDeps = {}): Hono<{ Variables: HostingAccountsVars }> {
  const router = new Hono<{ Variables: HostingAccountsVars }>();

  const getStorageInstance = (): IGtmStorage => deps.storage ?? getStorage();
  const getProviderFn = deps.providerFactory ?? getProvider;
  const auth = deps.authOverride ?? authMiddleware;

  router.use('*', auth);

  // ── POST / ────────────────────────────────────────────────────────────────
  router.post('/', async (c) => {
    const ctx = getAuthCtx(c);
    const raw = await c.req.json();
    const input = CreateHostingAccountSchema.parse(raw); // ZodError captured by errorHandler

    // Step 1 — pingToken (F-S04). Token inválido → TokenInvalidError → 401.
    // pingToken pode (a) throw TokenInvalidError em 401/403 upstream OU
    // (b) retornar false (provider impl interna decide). Tratamos ambos
    // como token inválido. ProviderError não-401 propaga inalterado.
    const provider = getProviderFn(input.provider, {
      token: input.token,
      wpAdminPassword: input.wp_admin_password,
    });
    const pingOk = await provider.pingToken();
    if (!pingOk) {
      throw new TokenInvalidError('Token Hostinger inválido ou revogado');
    }

    // Step 2 — sealEncrypt token + wp_admin_password (F-S02).
    const publicKey = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY;
    if (!publicKey) {
      throw new Error('STORAGE_ENCRYPTION_PUBLIC_KEY ausente — boot deve ter chamado assertEnv()');
    }
    const tokenEncrypted = await sealEncrypt(input.token, publicKey);
    const wpAdminEncrypted = input.wp_admin_password
      ? await sealEncrypt(input.wp_admin_password, publicKey)
      : undefined;

    // Step 3 — createAccount (F-S01)
    const storage = getStorageInstance();
    const account = await storage.createAccount({
      tenant_id: resolveTenantId(ctx),
      provider: input.provider,
      account_label: input.label,
      token_encrypted: tokenEncrypted,
      wp_admin_creds_encrypted: wpAdminEncrypted,
      account_email: input.account_email,
      status: 'active',
    });

    console.log(`[hosting-accounts] created user_id=${ctx.userId} account_id=${account.id}`);

    return c.json({ data: publicAccountView(account) }, 201);
  });

  // ── GET / ─────────────────────────────────────────────────────────────────
  router.get('/', async (c) => {
    const ctx = getAuthCtx(c);
    const storage = getStorageInstance();

    const accounts = await storage.listAccounts({ tenant_id: resolveTenantId(ctx) });
    return c.json({ data: accounts.map(publicAccountView) });
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  router.delete('/:id', async (c) => {
    const ctx = getAuthCtx(c);
    const id = c.req.param('id') as AccountId;
    const storage = getStorageInstance();

    const existing = await storage.getAccount(id);
    if (!existing) {
      throw new NotFoundError('hosting_account', id);
    }

    // AC-3 step 2: deleteAccount NÃO toca audit keys (RedisGtmStorage já honra).
    await storage.deleteAccount(id);
    console.log(`[hosting-accounts] deleted user_id=${ctx.userId} account_id=${id}`);

    return c.body(null, 204);
  });

  return router;
}

// Default export = router com deps reais (Supabase auth + factories reais).
const hostingAccountsRouter = createHostingAccountsRouter();
export default hostingAccountsRouter;
