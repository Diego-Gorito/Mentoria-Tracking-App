// auth.ts — JWT storage via localStorage (sem Supabase).
// Worker /api/auth/* emite tokens signed com HS256.
// TODO: migrar pra HttpOnly cookie via Worker pra melhor segurança (Era 2).

const TOKEN_KEY = 'mentoria-tracking.jwt'
const USER_KEY = 'mentoria-tracking.user'

export type AuthUser = {
  id: string
  email: string
  tenantId: string
  tenantSlug: string
  tenantName: string
  role: 'owner' | 'admin' | 'viewer'
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

// Decode JWT payload sem verificar assinatura (verificação é no Worker).
// Usado apenas pra leitura de claims no cliente.
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') return true
  return Date.now() / 1000 > payload.exp
}
