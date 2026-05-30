// api.ts — cliente fetch para o Hono Node.js API /api/*
// Injeta Bearer JWT em todas as requests autenticadas.
// TODO: adicionar retry com exponential backoff (Era 2).

import { getToken, getSession, setSession, clearSession } from './auth'


// Em dev: API roda em localhost:3000. Em prod: same-origin (Easypanel routing).
// Para usar VITE_API_BASE_URL, adicionar /// <reference types="vite/client" /> no projeto (Era 2).
const WORKER_BASE =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : ''

/** Calls /api/auth/refresh with current refresh_token. Updates session if success. Returns new access_token or null. */
async function refreshSession(): Promise<string | null> {
  const session = getSession()
  if (!session?.refresh_token) return null
  try {
    const res = await fetch(`${WORKER_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    const newSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    }
    setSession(newSession)
    return data.access_token
  } catch {
    return null
  }
}

type FetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
  /** Se true: não injeta Authorization (pra rotas públicas como login/signup) */
  public?: boolean
  /** Internal: set true on retry-after-refresh to prevent infinite loop */
  _retry?: boolean
}

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { public: isPublic, _retry, headers = {}, ...rest } = opts

  const token = getToken()
  const authHeader: Record<string, string> =
    !isPublic && token ? { Authorization: `Bearer ${token}` } : {}

  const res = await fetch(`${WORKER_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...headers,
    },
  })

  // 401 → tenta refresh 1x; se falhar, limpa sessão e redireciona login
  if (res.status === 401 && !_retry) {
    const newToken = await refreshSession()
    if (newToken) {
      return request<T>(path, { ...opts, _retry: true })
    }
    clearSession()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Backend F-S05 retorna `error` como objeto { code, message, request_id }.
    // Legado retornava string. Suporta ambos: prefere message do objeto, depois
    // string crua, depois HTTP status. (Sem isso, `new Error({...})` virava
    // "[object Object]" — UX ruim em telas como o conector Meta.)
    const errField = (body as { error?: unknown }).error
    const message =
      typeof errField === 'object' && errField !== null && 'message' in errField
        ? String((errField as { message: unknown }).message)
        : typeof errField === 'string'
          ? errField
          : `HTTP ${res.status} ${res.statusText}`
    const apiError = new Error(message) as Error & { code?: string; status?: number }
    if (typeof errField === 'object' && errField !== null && 'code' in errField) {
      apiError.code = String((errField as { code: unknown }).code)
    }
    apiError.status = res.status
    throw apiError
  }

  return res.json() as Promise<T>
}

// Signup response (no token — user logs in separately after signup)
export type SignupResponse = {
  user_id: string
  email: string
  tenant_slug: string | null
  tenant_id: string | null
}

// Login response (Supabase session format)
export type LoginResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'bearer'
  user: { user_id: string; email: string }
}

/** @deprecated use SignupResponse or LoginResponse */
export type AuthResponse = SignupResponse

export type MeResponse = {
  user_id: string
  email: string
  tenant_id: string
  slug: string
  name: string
  onboarding_step: number
  role: string
}

// --- Auth endpoints ---

export const authApi = {
  signup: (body: { email: string; password: string; name: string; tenant_slug?: string }) =>
    request<SignupResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
      public: true,
    }),

  login: (email: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      public: true,
    }),

  magicLink: (email: string) =>
    request<{ sent: boolean }>('/api/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
      public: true,
    }),

  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  refresh: (refresh_token: string) =>
    request<LoginResponse>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token }),
      public: true,
    }),

  me: () => request<MeResponse>('/api/me'),
}

// --- Tenant endpoints ---

export const tenantsApi = {
  resolve: (host: string) =>
    request<{ tenant: unknown } | null>(`/api/tenants/resolve?host=${encodeURIComponent(host)}`, {
      public: true,
    }),

  create: (data: { name: string; slug: string }) =>
    request<{ tenantId: string }>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => request<unknown>('/api/tenants/me'),
}

// --- Credentials endpoints ---

export const credentialsApi = {
  list: (tenantId: string) =>
    request<unknown[]>(`/api/credentials/${tenantId}`),

  upsert: (tenantId: string, data: { providerId: string; value: string; extraConfig?: unknown }) =>
    request<{ ok: boolean }>(`/api/credentials/${tenantId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  testConnection: (platform: string, tenantId: string) =>
    request<{ ok: boolean; message?: string }>(`/api/test/${platform}?tenantId=${tenantId}`, {
      method: 'POST',
    }),
}

// --- Query endpoint (whitelist runner) ---

export const queryApi = {
  run: (name: string, tenantId: string, params?: Record<string, unknown>) =>
    request<unknown>(`/api/query/${name}?tenantId=${encodeURIComponent(tenantId)}`, {
      method: 'POST',
      body: JSON.stringify(params ?? {}),
    }),
}

// --- Analytics endpoints (autenticados) ---

export type SummaryResponse = {
  leads_total: number
  leads_delta_pct: number
  conversions_total: number
  conversions_value_brl: number
  spend_brl: number
  roas: number
  cpl_brl: number
  dispatch_health_pct: number
  period_days: number
}

export type FunnelDay = {
  day: string
  sessions: number
  leads: number
  mql: number
  conversions: number
}

export type RoiPlatform = {
  platform: string
  spend_brl: number
  conversions: number
  value_brl: number
  roas: number
}

export type LeadRecent = {
  lead_id: string
  email_mask: string
  phone_mask: string
  name_mask: string
  score: number
  source: string
  last_event_at: string
  score_tier: string
}

export type DispatchFailed = {
  dispatch_id: string
  conversion_id: string
  platform: string
  retry_count: number
  last_error: string
  last_attempt_at: string
  status: string
}

export type ChannelDay = {
  day: string
  organic: number
  meta: number
  google: number
  hotmart: number
  direct: number
  outros: number
}

type Period = '7d' | '30d' | '90d'

export const analyticsApi = {
  summary: (period: Period = '30d') =>
    request<SummaryResponse>(`/api/analytics/summary?period=${period}`),

  funnel: (period: Period = '30d') =>
    request<{ data: FunnelDay[] }>(`/api/analytics/funnel?period=${period}`),

  roiPlatforms: (period: Period = '30d') =>
    request<{ data: RoiPlatform[] }>(`/api/analytics/roi-platforms?period=${period}`),

  leadsRecent: (limit = 20) =>
    request<{ data: LeadRecent[] }>(`/api/analytics/leads-recent?limit=${limit}`),

  dispatchesFailed: (limit = 20) =>
    request<{ data: DispatchFailed[] }>(`/api/analytics/dispatches-failed?limit=${limit}`),

  channels: (period: Period = '30d') =>
    request<{ data: ChannelDay[] }>(`/api/analytics/channels?period=${period}`),
}

// --- Health ---

export const healthApi = {
  check: () =>
    request<{ status: 'ok' }>('/api/health', { public: true }),
}

// --- Onboarding endpoints ---

export type OnboardingState = {
  tenant_id: string
  slug: string
  name: string
  onboarding_step: number
  onboarding_data: Record<string, unknown>
  completed_at: string | null
} | null

export type Step1Body = {
  name: string
  slug: string
  url?: string
  logo_url?: string
  brand_color: string
}

export type Step2Body = { tracking_verified: boolean }
export type Step3Body = { sources: string[]; form_platform?: string }
export type Step4Body = { platforms_configured: string[] }

export const onboardingApi = {
  getState: () =>
    request<OnboardingState>('/api/onboarding/state'),

  // B1 fix: POST com body {slug} ao invés de GET querystring
  checkSlug: (slug: string) =>
    request<{ available: boolean; reason?: string; suggestion?: string }>(
      '/api/onboarding/check-slug',
      { method: 'POST', body: JSON.stringify({ slug }) },
    ),

  // B4 fix: endpoint fantasma — retorna sempre {received: false} localmente.
  // TODO Era 1.5: implementar endpoint real GET /api/onboarding/check-tracking
  checkTracking: (): Promise<{ received: boolean; event?: { source: string; type: string; received_at: string } }> =>
    Promise.resolve({ received: false }),

  // B4 fix: endpoint fantasma — usa FileReader → base64 dataURL + cache localStorage.
  // TODO Era 1.5: upload real para S3/R2 + persistir em core.tenants.logo_url
  uploadLogo: (file: File, slug: string): Promise<{ url: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        try {
          localStorage.setItem(`mentoria-tracking.logo-${slug}`, dataUrl)
        } catch {
          // localStorage quota exceeded — continua sem cache
        }
        resolve({ url: dataUrl })
      }
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo de logo'))
      reader.readAsDataURL(file)
    }),

  // B3 fix: novo endpoint create-tenant
  createTenant: (body: { slug: string; name: string }) =>
    request<{ tenant_id: string; slug: string; onboarding_step: number }>(
      '/api/onboarding/create-tenant',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // B2 fix: PATCH + payload wrapped em {data: {...}}
  saveStep1: (body: Step1Body) =>
    request<{ ok: true }>('/api/onboarding/step/1', {
      method: 'PATCH',
      body: JSON.stringify({ data: body }),
    }),

  saveStep2: (body: Step2Body) =>
    request<{ ok: true }>('/api/onboarding/step/2', {
      method: 'PATCH',
      body: JSON.stringify({ data: body }),
    }),

  saveStep3: (body: Step3Body) =>
    request<{ ok: true }>('/api/onboarding/step/3', {
      method: 'PATCH',
      body: JSON.stringify({ data: body }),
    }),

  saveStep4: (body: Step4Body) =>
    request<{ ok: true }>('/api/onboarding/step/4', {
      method: 'PATCH',
      body: JSON.stringify({ data: body }),
    }),

  complete: () =>
    request<{ tenant_id: string; completed_at: string }>('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
}

// ─── GTM Container provisioning (ADR-0009 / F-S22 / F-S25) ───────────────────

export const gtmApi = {
  /** Status do container do tenant atual. */
  getStatus: (tenantSlug: string) =>
    request<{
      status?: string
      sgtm_url?: string | null
      web_container_public_id?: string | null
      web_container_internal_id?: string | null
      server_container_public_id?: string | null
      server_container_internal_id?: string | null
      created_at?: string | null
      last_published_at?: string | null
      failed_at_step?: string | null
      error_message?: string | null
      master_version?: { version_name: string; snapshot_at: string }
      tenant_id?: string
    }>(`/api/gtm/tenant-container/${encodeURIComponent(tenantSlug)}`),

  listMasterVersions: () =>
    request<{
      versions: Array<{
        id: string
        version_name: string
        snapshot_at: string
        notes?: string | null
        is_current: boolean
      }>
    }>('/api/gtm/master-versions'),

  /** POST /api/gtm/provision-container — cria 2 containers GTM (~2-4min). */
  provision: (body: {
    tenant_slug: string
    pixel_ids?: Record<string, string>
    webhook_secrets?: { kiwify?: string; kirvano?: string; stripe?: string }
  }) =>
    request<{
      tenant_id: string
      web_container: { public_id: string; internal_id: string; snippet: string }
      server_container: { public_id: string; internal_id: string; url: string }
      master_version: string
    }>('/api/gtm/provision-container', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** POST /api/gtm/republish/:slug — diff sync master → tenant. */
  republish: (tenantSlug: string, body: { autoPublish?: boolean } = {}) =>
    request<{
      tenant_id: string
      status: 'updated' | 'already_current' | 'no_changes'
      from_version: string
      to_version: string
      counts: {
        web: SyncCountsResp
        server: SyncCountsResp
      }
      warnings: string[]
    }>(`/api/gtm/republish/${encodeURIComponent(tenantSlug)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

type SyncCountsResp = {
  templates: { created: number; updated: number; skipped: number }
  variables: { created: number; updated: number; preserved_value: number; skipped: number }
  triggers: { created: number; updated: number; skipped: number }
  clients: { created: number; updated: number; skipped: number }
  tags: { created: number; updated: number; skipped: number }
}

// ─── Meta (Facebook) Ads connector (System User Token paste, MVP sem OAuth) ──

export type MetaAdAccountView = {
  id: string
  name: string
  status: number
  business_id: string | null
}

export type MetaPixelView = {
  id: string
  name: string
  last_fired_time: string | null
}

export type MetaStatus = {
  connected: boolean
  business_id: string | null
  ad_account_id: string | null
  pixel_id: string | null
  status: string | null
}

export const metaApi = {
  /** Estado atual da conexão (sem token). */
  status: () => request<MetaStatus>('/api/meta/status'),

  /** Valida + cifra o System User token, retorna business_id + ad accounts. */
  connect: (token: string) =>
    request<{ business_id: string | null; ad_accounts: MetaAdAccountView[] }>(
      '/api/meta/connect',
      { method: 'POST', body: JSON.stringify({ token }) },
    ),

  /** Re-lista ad accounts usando o token guardado. */
  adAccounts: () =>
    request<{ ad_accounts: MetaAdAccountView[] }>('/api/meta/ad-accounts'),

  /** Lista pixels de uma ad account. */
  pixels: (adAccountId: string) =>
    request<{ pixels: MetaPixelView[] }>(
      `/api/meta/pixels?ad_account_id=${encodeURIComponent(adAccountId)}`,
    ),

  /** Grava seleção + escreve pixel no container GTM. */
  select: (adAccountId: string, pixelId: string) =>
    request<{
      ad_account_id: string
      pixel_id: string
      container_synced: boolean
      detail?: string
    }>('/api/meta/select', {
      method: 'POST',
      body: JSON.stringify({ ad_account_id: adAccountId, pixel_id: pixelId }),
    }),

  /** Desconecta (soft revoke por padrão). */
  disconnect: () =>
    request<{ status: string }>('/api/meta/disconnect', { method: 'DELETE' }),
}
