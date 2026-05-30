/**
 * `client.ts` — cliente fino do Meta Marketing API (Graph API v21.0).
 *
 * Usado pelo conector "System User Token paste" (MVP sem OAuth): o cliente cola
 * um System User access token long-lived do Business Manager, e a gente lista
 * ad accounts + pixels via Graph API pra popular a var [CT] [Meta Ads] Pixel ID
 * do container GTM.
 *
 * SEM SDK Meta — native fetch + AbortSignal.timeout. Erros do Graph (code 190,
 * rate limit, permissão) viram as classes de `./errors.ts` que o errorHandler
 * central mapeia. O token NUNCA é logado — só usado como query param `access_token`
 * (Graph não aceita Authorization header pra esse fluxo) e descartado.
 *
 * @see https://developers.facebook.com/docs/marketing-api/reference/
 */

import {
  MetaApiError,
  MetaPermissionError,
  MetaRateLimitError,
  MetaTokenInvalidError,
} from './errors';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FETCH_TIMEOUT_MS = 15_000;

// ─── Response shapes (subset dos fields que pedimos) ────────────────────────

export interface MetaTokenInfo {
  valid: true;
  /** Scopes concedidos ao token (de /me/permissions ou debug_token). Pode vir vazio. */
  scopes: string[];
  /** Nome do usuário/system user dono do token. */
  name: string;
  /** ID do nó /me (user ou system user). */
  id: string;
}

export interface MetaAdAccount {
  /** Formato `act_XXXXXXXXXX`. */
  id: string;
  name: string;
  /** account_status numérico do Graph (1 = ACTIVE, 2 = DISABLED, etc). */
  status: number;
  /** Business Manager ID dono da conta (quando exposto). */
  business_id: string | null;
}

export interface MetaPixel {
  id: string;
  name: string;
  /** ISO timestamp do último disparo do pixel, se houver. */
  last_fired_time: string | null;
}

export interface MetaCampaignInsight {
  campaign_id: string;
  campaign_name: string;
  /** spend é string decimal na moeda da conta (ex "835.89"). */
  spend: string;
  account_currency: string;
}

// ─── Graph error parsing ────────────────────────────────────────────────────

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Códigos de rate limit conhecidos do Graph API. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/**
 * Classifica um erro do Graph API (status + body) na subclass apropriada.
 * NÃO inclui o token na mensagem (LGPD/segurança).
 */
function classifyMetaError(status: number, body: unknown): MetaApiError {
  const err = (body as GraphErrorBody)?.error;
  const code = err?.code;
  const message = err?.message ?? `Meta Graph API HTTP ${status}`;

  // 190 = OAuthException (token inválido/expirado/revogado), independente do status.
  if (code === 190 || err?.type === 'OAuthException') {
    // Subcode 463/467 = expirado/inválido; tratamos todo OAuthException de token
    // como inválido pro fluxo de "cole um novo token".
    return new MetaTokenInvalidError(message, body);
  }

  if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    return new MetaRateLimitError(undefined, body);
  }

  // Permissão: code 10 ou faixa 200-299 (ex: 200 = permissão ausente).
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
    return new MetaPermissionError(message, body);
  }

  if (status === 401 || status === 403) {
    return new MetaTokenInvalidError(message, body);
  }
  if (status === 429) {
    return new MetaRateLimitError(undefined, body);
  }

  return new MetaApiError(message, status >= 500 ? 502 : status, body);
}

// ─── Client ─────────────────────────────────────────────────────────────────

export interface MetaClientOpts {
  /** Custom fetch (testes). Default: global fetch. */
  fetchImpl?: typeof fetch;
  /** Override do base URL (testes). */
  baseUrl?: string;
}

export class MetaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: MetaClientOpts = {}) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.baseUrl = opts.baseUrl ?? GRAPH_BASE;
  }

  /**
   * GET genérico no Graph. `params` vira querystring; `access_token` é anexado
   * aqui (nunca logado). Lança subclass de MetaApiError em status !ok.
   */
  private async graphGet<T>(
    path: string,
    token: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const qs = new URLSearchParams({ ...params, access_token: token });
    const url = `${this.baseUrl}${path}?${qs.toString()}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      // Timeout / rede — NÃO vaza url (contém token). Mensagem genérica.
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new MetaApiError('Timeout ao falar com o Meta Graph API', 504, err);
      }
      throw new MetaApiError('Falha de rede ao falar com o Meta Graph API', 502, err);
    }

    const body = await safeJson(res);
    if (!res.ok) {
      throw classifyMetaError(res.status, body);
    }
    return body as T;
  }

  /**
   * Valida o token via GET /me. Retorna info básica + scopes (best-effort via
   * /me/permissions). Lança MetaTokenInvalidError se rejeitado (190).
   */
  async validateToken(token: string): Promise<MetaTokenInfo> {
    const me = await this.graphGet<{ id: string; name?: string }>(
      '/me',
      token,
      { fields: 'id,name' },
    );

    // Scopes: best-effort. Se /me/permissions falhar, não derruba a validação —
    // o token já provou ser válido no GET /me acima.
    let scopes: string[] = [];
    try {
      const perms = await this.graphGet<{
        data?: Array<{ permission: string; status: string }>;
      }>('/me/permissions', token);
      scopes = (perms.data ?? [])
        .filter((p) => p.status === 'granted')
        .map((p) => p.permission);
    } catch {
      // ignore — scopes ficam vazios, validação segue válida
    }

    return { valid: true, id: me.id, name: me.name ?? '', scopes };
  }

  /**
   * Lista as ad accounts acessíveis pelo token (GET /me/adaccounts).
   * Pagina via `after` cursor até esgotar (limit 200/página).
   */
  async listAdAccounts(token: string): Promise<MetaAdAccount[]> {
    const out: MetaAdAccount[] = [];
    let after: string | undefined;

    do {
      const params: Record<string, string> = {
        fields: 'id,name,account_status,business',
        limit: '200',
      };
      if (after) params.after = after;

      const page = await this.graphGet<{
        data?: Array<{
          id: string;
          name?: string;
          account_status?: number;
          business?: { id: string };
        }>;
        paging?: { cursors?: { after?: string }; next?: string };
      }>('/me/adaccounts', token, params);

      for (const a of page.data ?? []) {
        out.push({
          id: a.id,
          name: a.name ?? a.id,
          status: a.account_status ?? 0,
          business_id: a.business?.id ?? null,
        });
      }
      after = page.paging?.next ? page.paging?.cursors?.after : undefined;
    } while (after);

    return out;
  }

  /**
   * Lista os pixels (ads pixels / datasets) de uma ad account
   * (GET /{ad_account_id}/adspixels). `adAccountId` deve incluir o prefixo
   * `act_`. Pagina via cursor.
   */
  async listPixels(token: string, adAccountId: string): Promise<MetaPixel[]> {
    const acct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const out: MetaPixel[] = [];
    let after: string | undefined;

    do {
      const params: Record<string, string> = {
        fields: 'id,name,last_fired_time',
        limit: '200',
      };
      if (after) params.after = after;

      const page = await this.graphGet<{
        data?: Array<{ id: string; name?: string; last_fired_time?: string }>;
        paging?: { cursors?: { after?: string }; next?: string };
      }>(`/${acct}/adspixels`, token, params);

      for (const p of page.data ?? []) {
        out.push({
          id: p.id,
          name: p.name ?? p.id,
          last_fired_time: p.last_fired_time ?? null,
        });
      }
      after = page.paging?.next ? page.paging?.cursors?.after : undefined;
    } while (after);

    return out;
  }

  /**
   * Insights de CUSTO por campanha (GET /{ad_account}/insights, level=campaign).
   * Retorna spend (string decimal na moeda da conta) por campanha no período.
   * READ-ONLY — usado pelo cost-sync (#73). Pagina via cursor. @see docs/adr-0011 §5b.
   */
  async listCampaignInsights(
    token: string,
    adAccountId: string,
    datePreset = 'last_30d',
  ): Promise<MetaCampaignInsight[]> {
    const acct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const out: MetaCampaignInsight[] = [];
    let after: string | undefined;

    do {
      const params: Record<string, string> = {
        level: 'campaign',
        fields: 'campaign_id,campaign_name,spend,account_currency',
        date_preset: datePreset,
        limit: '500',
      };
      if (after) params.after = after;

      const page = await this.graphGet<{
        data?: Array<{
          campaign_id?: string;
          campaign_name?: string;
          spend?: string;
          account_currency?: string;
        }>;
        paging?: { cursors?: { after?: string }; next?: string };
      }>(`/${acct}/insights`, token, params);

      for (const r of page.data ?? []) {
        if (!r.campaign_id) continue;
        out.push({
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name ?? r.campaign_id,
          spend: r.spend ?? '0',
          account_currency: r.account_currency ?? 'BRL',
        });
      }
      after = page.paging?.next ? page.paging?.cursors?.after : undefined;
    } while (after);

    return out;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Singleton-ish factory (consistente com getGtmClient). Sem cache por enquanto
 *  porque o client é stateless — cada request usa um token diferente. */
export function getMetaClient(opts?: MetaClientOpts): MetaClient {
  return new MetaClient(opts);
}
