// jwt.ts — HS256 sign/verify helpers (hono/jwt)
// JWT_SECRET deve ter 32+ chars (setado no Easypanel tracking-api).
// Expiração padrão: 7 dias.

import { sign, verify } from 'hono/jwt'

if (!process.env.JWT_SECRET) {
  throw new Error('[jwt] JWT_SECRET env var não configurado')
}

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRY_SECS = 60 * 60 * 24 * 7 // 7 dias

export type JwtPayload = {
  sub: string        // user_id (uuid)
  email: string
  tenant_slug?: string
  role?: string
  exp: number
  iat: number
}

export async function signToken(
  payload: Pick<JwtPayload, 'sub' | 'email' | 'tenant_slug' | 'role'>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      ...payload,
      iat: now,
      exp: now + JWT_EXPIRY_SECS,
    },
    JWT_SECRET,
  )
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const payload = await verify(token, JWT_SECRET, 'HS256')
  return payload as unknown as JwtPayload
}
