// useTenant — acessa o tenant do contexto de auth (pós-login).
// TODO: implementar com AuthContext + Worker /api/tenants/me (Era 1 sprint 2).

import { useState, useEffect } from 'react'
import { getUser, type AuthUser } from '@/lib/auth'

export type TenantInfo = {
  tenantId: string
  slug: string
  name: string
}

export function useTenant(): { tenant: TenantInfo | null; loading: boolean } {
  const [loading, setLoading] = useState(true)
  const [tenant, setTenant] = useState<TenantInfo | null>(null)

  useEffect(() => {
    const user: AuthUser | null = getUser()
    if (user && user.tenantId) {
      setTenant({
        tenantId: user.tenantId,
        slug: user.tenantSlug ?? '',
        name: user.tenantName ?? '',
      })
    }
    setLoading(false)
  }, [])

  return { tenant, loading }
}
