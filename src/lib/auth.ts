// auth.ts — Supabase session format via localStorage.
// Backend /api/auth/* endpoints issue Supabase-compatible tokens.
// Session stored as {access_token, refresh_token, expires_at} JSON.

const SESSION_KEY = 'mentoria-tracking.session'

export type SupabaseSession = {
  access_token: string
  refresh_token: string
  expires_at: number // unix timestamp seconds
}

export type AuthUser = {
  id: string
  email: string
  tenantId?: string
  tenantSlug?: string
  tenantName?: string
  role?: string
}

export type SignupResult = {
  user_id: string
  email: string
  tenant_slug: string | null
  tenant_id: string | null
}

export type LoginResult = {
  session: SupabaseSession
  user: AuthUser
}

// --- Session storage ---

export function getSession(): SupabaseSession | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SupabaseSession
  } catch {
    return null
  }
}

export function setSession(session: SupabaseSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

/** @deprecated use getSession().access_token instead. Kept for api.ts compat. */
export function getToken(): string | null {
  return getSession()?.access_token ?? null
}

/** @deprecated use clearSession() */
export function clearToken(): void {
  clearSession()
}

// --- User helpers ---

/** Decode JWT payload without verifying signature (verification is on server). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function isSessionExpired(session: SupabaseSession): boolean {
  // Add 30s buffer to avoid edge-case expiry mid-request
  return Date.now() / 1000 > session.expires_at - 30
}

/** @deprecated use isSessionExpired(session) */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') return true
  return Date.now() / 1000 > payload.exp
}

export function isAuthenticated(): boolean {
  const session = getSession()
  if (!session) return false
  return !isSessionExpired(session)
}

export function getUser(): AuthUser | null {
  const session = getSession()
  if (!session) return null
  const payload = decodeJwtPayload(session.access_token)
  if (!payload) return null
  const sub = payload.sub as string | undefined
  const email = payload.email as string | undefined
  if (!sub || !email) return null
  const meta = (payload.user_metadata as Record<string, unknown> | undefined) ?? {}
  return {
    id: sub,
    email,
    tenantId: meta.tenant_id as string | undefined,
    tenantSlug: meta.tenant_slug as string | undefined,
    tenantName: meta.tenant_name as string | undefined,
    role: meta.role as string | undefined,
  }
}
