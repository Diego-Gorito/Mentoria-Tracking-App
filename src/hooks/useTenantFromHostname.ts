// useTenantFromHostname — resolve tenant via hostname antes do login.
// Adaptado do ERP-Mentoria: troca Supabase RPC por fetch Worker /api/tenants/resolve?host=...
//
// Padrões suportados:
//   1. {slug}.tracking.escola.click   → tenant via slug
//   2. custom_domain próprio           → tenant via custom_domain (Era 2)
//   3. localhost / IP                  → null (modo dev)
//
// Uso:
//   const { tenant, loading } = useTenantFromHostname()

import { useEffect, useState } from 'react'
import { tenantsApi } from '@/lib/api'

export type TenantPublicInfo = {
  id: string
  slug: string
  name: string
  logo_url: string | null
  color_preset: string | null
  custom_domain: string | null
  match_kind: 'subdomain' | 'custom_domain'
}

export type TenantHostnameResult = {
  tenant: TenantPublicInfo | null
  loading: boolean
  error: string | null
  hostname: string
  isDevMode: boolean
}

const DEV_HOSTS = new Set(['localhost', '127.0.0.1'])

function getCurrentHostname(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hostname.toLowerCase()
}

function isDevHostname(h: string): boolean {
  return DEV_HOSTS.has(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h)
}

export function useTenantFromHostname(): TenantHostnameResult {
  const [tenant, setTenant] = useState<TenantPublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hostname = getCurrentHostname()
  const isDevMode = isDevHostname(hostname)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      // Modo dev: não resolve, retorna null (app funciona sem tenant no hostname)
      if (isDevMode || !hostname) {
        if (!cancelled) {
          setTenant(null)
          setLoading(false)
        }
        return
      }

      try {
        // TODO: Worker /api/tenants/resolve retorna null quando tenant não encontrado
        const data = await tenantsApi.resolve(hostname)

        if (cancelled) return

        if (data && (data as { tenant: TenantPublicInfo | null }).tenant) {
          setTenant((data as { tenant: TenantPublicInfo }).tenant)
          setError(null)
        } else {
          setTenant(null)
          setError(`Tenant não encontrado para hostname "${hostname}"`)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erro desconhecido')
          setTenant(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    resolve()
    return () => {
      cancelled = true
    }
  }, [hostname, isDevMode])

  return { tenant, loading, error, hostname, isDevMode }
}
