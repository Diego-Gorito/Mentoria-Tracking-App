/**
 * sites.ts — Hono router /api/sites
 *
 * Source-of-truth: `docs/stories/F-S05.md` AC-4 (merge provider.listSites +
 * storage.getInstallationBySite, cache 60s em memória).
 *
 * Único endpoint:
 *   GET / → EnrichedSite[]
 *
 * Cache key = account.id. TTL 60s (per AC-4). Cache em memória do processo
 * (single-replica MVP). Onda 1.5: trocar por Redis cache se houver múltiplas
 * réplicas.
 */

import { Hono } from 'hono';

import { authMiddleware, getAuthCtx, type AuthContext } from './middleware';
import { getStorage, type IGtmStorage } from '../lib/storage';
import { sealDecrypt } from '../lib/storage/crypto';
import { getProvider, type IHostingProvider, type Site } from '../lib/providers';
import type { HostingAccount, TenantId } from '../lib/storage/types';
import { MENTORIA_TENANT_ID } from '../lib/constants';

// ---------- types ----------

export interface EnrichedSite extends Site {
  status?: 'installed' | 'draft' | 'failed' | 'drift_detected' | 'uploading' | 'activating' | 'validating' | 'uploaded_pending_activation' | 'uninstalled';
  brand_slug?: string;
  container_id?: string;
  last_install_at?: string;
  installation_id?: string;
  hosting_account_id?: string;
}

export type SitesVars = {
  authCtx: AuthContext;
  requestId: string;
};

interface SitesDeps {
  storage?: IGtmStorage;
  providerFactory?: (
    type: 'hostinger',
    creds: { token: string; wpAdminPassword?: string },
  ) => IHostingProvider;
  authOverride?: (c: Parameters<typeof authMiddleware>[0], n: Parameters<typeof authMiddleware>[1]) => Promise<Response | void>;
  /** Override clock pra testes (default Date.now). */
  now?: () => number;
}

// ---------- cache module-scoped ----------

const SITES_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  sites: Site[];
  exp: number;
}

const sitesCache = new Map<string, CacheEntry>();

/** Test helper — limpa cache entre testes. NÃO usar em prod. */
export function __clearSitesCache(): void {
  sitesCache.clear();
}

// ---------- helpers ----------

function resolveTenantId(_ctx: AuthContext): TenantId {
  return MENTORIA_TENANT_ID;
}

async function decryptToken(account: HostingAccount): Promise<string> {
  const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY;
  const sec = process.env.STORAGE_ENCRYPTION_SECRET_KEY;
  if (!pub || !sec) {
    throw new Error('STORAGE_ENCRYPTION_PUBLIC_KEY/SECRET_KEY ausentes — boot deve ter chamado assertEnv()');
  }
  return sealDecrypt(account.token_encrypted, pub, sec);
}

async function decryptWpAdmin(account: HostingAccount): Promise<string | undefined> {
  if (!account.wp_admin_creds_encrypted) return undefined;
  const pub = process.env.STORAGE_ENCRYPTION_PUBLIC_KEY;
  const sec = process.env.STORAGE_ENCRYPTION_SECRET_KEY;
  if (!pub || !sec) return undefined;
  return sealDecrypt(account.wp_admin_creds_encrypted, pub, sec);
}

// ---------- factory ----------

export function createSitesRouter(deps: SitesDeps = {}): Hono<{ Variables: SitesVars }> {
  const router = new Hono<{ Variables: SitesVars }>();
  const getStorageInstance = (): IGtmStorage => deps.storage ?? getStorage();
  const getProviderFn = deps.providerFactory ?? getProvider;
  const auth = deps.authOverride ?? authMiddleware;
  const now = deps.now ?? Date.now;

  router.use('*', auth);

  // ── GET / ─────────────────────────────────────────────────────────────────
  router.get('/', async (c) => {
    const ctx = getAuthCtx(c);
    const storage = getStorageInstance();

    const accounts = await storage.listAccounts({ tenant_id: resolveTenantId(ctx) });
    const activeAccounts = accounts.filter((a) => a.status === 'active');

    // Per AC-4: pra cada account ativo, chamar provider.listSites() com cache 60s.
    const enriched: EnrichedSite[] = [];

    for (const account of activeAccounts) {
      const cached = sitesCache.get(account.id);
      let sites: Site[];

      if (cached && cached.exp > now()) {
        sites = cached.sites;
      } else {
        const token = await decryptToken(account);
        const wpAdminPassword = await decryptWpAdmin(account);
        const provider = getProviderFn(account.provider, { token, wpAdminPassword });
        sites = await provider.listSites();
        sitesCache.set(account.id, { sites, exp: now() + SITES_CACHE_TTL_MS });
      }

      // Merge cada site com storage.getInstallationBySite (idempotency lookup).
      for (const site of sites) {
        const installation = await storage.getInstallationBySite(site.domain);
        const enrichedSite: EnrichedSite = {
          ...site,
          ...(installation
            ? {
                status: installation.status,
                brand_slug: installation.brand_slug,
                container_id: installation.gtm_container_id,
                installation_id: installation.id,
                hosting_account_id: installation.hosting_account_id,
                last_install_at: installation.installed_at,
              }
            : {
                hosting_account_id: account.id,
              }),
        };
        enriched.push(enrichedSite);
      }
    }

    return c.json({ data: enriched });
  });

  return router;
}

// Default export = router com deps reais.
const sitesRouter = createSitesRouter();
export default sitesRouter;
