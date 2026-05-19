// useAnalytics — hooks reais para /api/analytics/* (Era 1 sprint 3).
// Substitui mocks anteriores. Cada hook: loading/error/data pattern.

import { useState, useEffect } from 'react'
import {
  analyticsApi,
  type SummaryResponse,
  type FunnelDay,
  type RoiPlatform,
  type LeadRecent,
  type DispatchFailed,
  type ChannelDay,
} from '@/lib/api'

type Period = '7d' | '30d' | '90d'

type HookResult<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

// Reutilizável para qualquer tipo de fetch.
function useApiCall<T>(fetcher: () => Promise<T>, deps: unknown[]): HookResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetcher()
      .then((res) => { if (!cancelled) { setData(res); setLoading(false) } })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}

// --- Hooks públicos ---

export function useAnalyticsSummary(period: Period = '30d'): HookResult<SummaryResponse> {
  return useApiCall(() => analyticsApi.summary(period), [period])
}

export function useAnalyticsFunnel(period: Period = '30d'): HookResult<{ data: FunnelDay[] }> {
  return useApiCall(() => analyticsApi.funnel(period), [period])
}

export function useAnalyticsRoiPlatforms(period: Period = '30d'): HookResult<{ data: RoiPlatform[] }> {
  return useApiCall(() => analyticsApi.roiPlatforms(period), [period])
}

export function useAnalyticsLeadsRecent(limit = 20): HookResult<{ data: LeadRecent[] }> {
  return useApiCall(() => analyticsApi.leadsRecent(limit), [limit])
}

export function useAnalyticsDispatchesFailed(limit = 20): HookResult<{ data: DispatchFailed[] }> {
  return useApiCall(() => analyticsApi.dispatchesFailed(limit), [limit])
}

export function useAnalyticsChannels(period: Period = '30d'): HookResult<{ data: ChannelDay[] }> {
  return useApiCall(() => analyticsApi.channels(period), [period])
}

// Re-export tipos pra componentes que importam daqui
export type { SummaryResponse, FunnelDay, RoiPlatform, LeadRecent, DispatchFailed, ChannelDay, Period }

// Compat: KpiData — removido mock, mantido export de tipo pra não quebrar importações antigas
export type KpiData = SummaryResponse
