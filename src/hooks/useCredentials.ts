// useCredentials — lista credenciais do tenant via /api/credentials/:tenantId.
// Substitui mock localStorage anterior.
// Pattern loading/error/data consistente com useAnalytics.

import { useState, useEffect, useCallback } from 'react'
import { credentialsApi } from '@/lib/api'
import { useTenant } from './useTenant'

export type CredentialStatus =
  | 'not_configured'
  | 'configured_not_validated'
  | 'configured_validated'
  | 'error'

export type CredentialEntry = {
  providerId: string
  status: CredentialStatus
  lastValidatedAt: string | null
  extraConfig: Record<string, unknown>
}

// Shape que o backend retorna (mapeado pra CredentialEntry)
type ApiCredential = {
  provider_id?: string
  providerId?: string
  status?: CredentialStatus
  last_validated_at?: string | null
  lastValidatedAt?: string | null
  extra_config?: Record<string, unknown>
  extraConfig?: Record<string, unknown>
}

function normalizeCredential(raw: ApiCredential): CredentialEntry {
  return {
    providerId: raw.provider_id ?? raw.providerId ?? '',
    status: raw.status ?? 'not_configured',
    lastValidatedAt: raw.last_validated_at ?? raw.lastValidatedAt ?? null,
    extraConfig: raw.extra_config ?? raw.extraConfig ?? {},
  }
}

export function useCredentials(): {
  credentials: CredentialEntry[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { tenant, loading: tenantLoading } = useTenant()
  const [credentials, setCredentials] = useState<CredentialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (tenantLoading) return

    if (!tenant?.tenantId) {
      setCredentials([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    credentialsApi
      .list(tenant.tenantId)
      .then((raw) => {
        if (cancelled) return
        const items = Array.isArray(raw)
          ? (raw as ApiCredential[]).map(normalizeCredential)
          : []
        setCredentials(items)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Erro ao carregar credenciais')
        setLoading(false)
      })

    return () => { cancelled = true }

  }, [tenant?.tenantId, tenantLoading, tick])

  return { credentials, loading, error, refresh }
}
