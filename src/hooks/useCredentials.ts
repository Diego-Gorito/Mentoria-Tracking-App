// useCredentials — lista credenciais do tenant atual (pós-login).
// TODO: implementar com credentialsApi.list (Era 1 sprint 2).

import { useState, useEffect } from 'react'
import { useTenant } from './useTenant'

export type CredentialEntry = {
  providerId: string
  status: 'not_configured' | 'configured_not_validated' | 'configured_validated' | 'error'
  lastValidatedAt: string | null
  extraConfig: Record<string, unknown>
}

export function useCredentials(): {
  credentials: CredentialEntry[]
  loading: boolean
  error: string | null
} {
  const { tenant } = useTenant()
  const [credentials, setCredentials] = useState<CredentialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenant) {
      setLoading(false)
      return
    }

    // TODO: substituir por credentialsApi.list(tenant.tenantId)
    const MOCK_CREDENTIALS: CredentialEntry[] = [
      { providerId: 'meta_capi', status: 'not_configured', lastValidatedAt: null, extraConfig: {} },
      { providerId: 'hotmart', status: 'not_configured', lastValidatedAt: null, extraConfig: {} },
      { providerId: 'gtm_server', status: 'not_configured', lastValidatedAt: null, extraConfig: {} },
      { providerId: 'chatwoot', status: 'not_configured', lastValidatedAt: null, extraConfig: {} },
      { providerId: 'pinterest_capi', status: 'not_configured', lastValidatedAt: null, extraConfig: {} },
      { providerId: 'google_ads', status: 'not_configured', lastValidatedAt: null, extraConfig: {} },
    ]

    setCredentials(MOCK_CREDENTIALS)
    setLoading(false)
    setError(null)
  }, [tenant])

  return { credentials, loading, error }
}
