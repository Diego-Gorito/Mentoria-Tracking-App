/**
 * GTM Service Account auth helper.
 *
 * Loads Service Account JSON key (carrega de env var ou filesystem) e gera
 * authenticated client com scopes apropriados pra GTM API.
 *
 * ADR-0009 §3.7 — SA key DEVE ir pra Supabase Vault em prod. MVP atual lê
 * de env var GTM_SA_KEY_JSON (conteúdo JSON completo) ou GTM_SA_KEY_PATH
 * (path pro JSON no filesystem).
 *
 * Em dev local: `GTM_SA_KEY_PATH=/Volumes/SSD 2T/Dev/tracking-claude-sa.json`
 * Em prod Easypanel: `GTM_SA_KEY_JSON='{...}'` ou via Vault read.
 *
 * @see scripts/gtm/README.md
 */

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';
import {
  GTM_SCOPES,
  type GtmScope,
  type GtmServiceAccountKey,
} from './types';
import { GtmAuthError } from './errors';

/**
 * Default scopes pro use case de provision: full edit + publish.
 * readonly não é suficiente — precisa create container, copy entities, publish version.
 */
export const DEFAULT_GTM_SCOPES: GtmScope[] = [
  GTM_SCOPES.editContainers,
  GTM_SCOPES.editContainerVersions,
  GTM_SCOPES.publish,
  GTM_SCOPES.readonly,
];

let cachedAuth: GoogleAuth | null = null;
let cachedKey: GtmServiceAccountKey | null = null;

/**
 * Carrega Service Account key de env var (priority) ou filesystem path.
 *
 * Order:
 *   1. `GTM_SA_KEY_JSON` — JSON string completo (prod Easypanel)
 *   2. `GTM_SA_KEY_PATH` — path absoluto pro JSON (dev local)
 *   3. throw GtmAuthError
 */
export function loadServiceAccountKey(): GtmServiceAccountKey {
  if (cachedKey) return cachedKey;

  const envJson = process.env.GTM_SA_KEY_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson) as GtmServiceAccountKey;
      validateKey(parsed);
      cachedKey = parsed;
      return parsed;
    } catch (err) {
      throw new GtmAuthError(
        `Failed to parse GTM_SA_KEY_JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const envPath = process.env.GTM_SA_KEY_PATH;
  if (envPath) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      const parsed = JSON.parse(content) as GtmServiceAccountKey;
      validateKey(parsed);
      cachedKey = parsed;
      return parsed;
    } catch (err) {
      throw new GtmAuthError(
        `Failed to load GTM_SA_KEY_PATH=${envPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw new GtmAuthError(
    'Missing GTM Service Account key. Set GTM_SA_KEY_JSON (prod) or GTM_SA_KEY_PATH (dev).',
  );
}

/** Sanity check no shape do JSON antes de usar. */
function validateKey(key: unknown): asserts key is GtmServiceAccountKey {
  const k = key as Partial<GtmServiceAccountKey>;
  if (k?.type !== 'service_account') {
    throw new GtmAuthError(`Invalid SA key: type='${k?.type ?? 'undefined'}' (expected 'service_account')`);
  }
  if (!k.client_email || !k.private_key) {
    throw new GtmAuthError('Invalid SA key: missing client_email or private_key');
  }
}

/**
 * Returns a singleton authenticated GoogleAuth client com `getAccessToken()`
 * + auto-refresh.
 *
 * Uso típico:
 * ```ts
 * const auth = getGtmAuth();
 * const token = await auth.getAccessToken();
 * await fetch('https://tagmanager.googleapis.com/...', {
 *   headers: { Authorization: `Bearer ${token}` }
 * });
 * ```
 */
export function getGtmAuth(scopes: GtmScope[] = DEFAULT_GTM_SCOPES): GoogleAuth {
  if (cachedAuth) return cachedAuth;
  const key = loadServiceAccountKey();
  cachedAuth = new GoogleAuth({
    credentials: {
      client_email: key.client_email,
      private_key: key.private_key,
    },
    scopes,
  });
  return cachedAuth;
}

/**
 * Reset cache (test only). NÃO usar em prod.
 * @internal
 */
export function _resetAuthCache(): void {
  cachedAuth = null;
  cachedKey = null;
}

/**
 * Helper conveniente: retorna access token fresco (auto-refresh quando expira).
 */
export async function getGtmAccessToken(
  scopes: GtmScope[] = DEFAULT_GTM_SCOPES,
): Promise<string> {
  const auth = getGtmAuth(scopes);
  const token = await auth.getAccessToken();
  if (!token) {
    throw new GtmAuthError('GoogleAuth returned null access token');
  }
  return token;
}

/** Email da SA (audit/logging). */
export function getServiceAccountEmail(): string {
  const key = loadServiceAccountKey();
  return key.client_email;
}
