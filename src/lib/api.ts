// api.ts — cliente fetch para o Hono Node.js API /api/*
// Injeta Bearer JWT em todas as requests autenticadas.
// TODO: adicionar retry com exponential backoff (Era 2).

import { getToken, clearToken } from './auth'

// Em dev: API roda em localhost:3000. Em prod: same-origin (Easypanel routing).
// Para usar VITE_API_BASE_URL, adicionar /// <reference types="vite/client" /> no projeto (Era 2).
const WORKER_BASE =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : ''

type FetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
  /** Se true: não injeta Authorization (pra rotas públicas como login/signup) */
  public?: boolean
}

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { public: isPublic, headers = {}, ...rest } = opts

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

  // 401 → limpa token e recarrega pra tela de login
  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status} ${res.statusText}`,
    )
  }

  return res.json() as Promise<T>
}

// Tipo de resposta auth (signup e login retornam mesma shape)
export type AuthResponse = {
  user_id: string
  email: string
  tenant_slug: string | null
  tenant_name: string | null
  role: string | null
  onboarding_step: number
  token: string
}

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
    request<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
      public: true,
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
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
