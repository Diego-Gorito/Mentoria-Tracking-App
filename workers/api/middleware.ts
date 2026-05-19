// middleware.ts — auth middleware Bearer JWT
// Injeta payload verificado em c.set('jwtUser', payload).
// Retorna 401 JSON se token ausente ou inválido.

import type { Context, Next } from 'hono'
import { verifyToken, type JwtPayload } from './jwt'

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Acesso nao autorizado' }, 401)
  }

  try {
    const payload = await verifyToken(auth.slice(7))
    c.set('jwtUser', payload)
    await next()
  } catch {
    return c.json({ error: 'Token invalido ou expirado' }, 401)
  }
}

// Tipo helper pra usar nos handlers
export function getJwtUser(c: Context): JwtPayload {
  return c.get('jwtUser') as JwtPayload
}
