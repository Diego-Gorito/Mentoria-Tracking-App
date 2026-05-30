// useAnalytics — hooks reais para /api/analytics/* (Era 1 sprint 3).
// Substitui mocks anteriores. Cada hook: loading/error/data pattern.
//
// Auto-refresh (dashboard): cada hook aceita um `refreshKey` opcional. Quando
// ele muda (tick de 60s OU refresh manual), o fetch roda de novo SEM piscar
// skeleton — `loading` só é true no primeiro fetch; refetchs em background
// expõem `refreshing` e mantêm o `data` anterior na tela até chegar o novo.

import { useState, useEffect, useRef } from 'react'
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
  /** true durante refetch em background (refreshKey mudou). data continua válido. */
  refreshing: boolean
  error: string | null
}

// Reutilizável para qualquer tipo de fetch.
// `deps` dispara um reload "duro" (mostra skeleton). `refreshKey` dispara um
// refetch "macio" (mantém data anterior, só marca refreshing).
function useApiCall<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  refreshKey: number = 0,
): HookResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Distingue first-load (skeleton) de refetch (silencioso). Reseta quando as
  // deps "duras" mudam (ex: trocar período → faz sentido mostrar skeleton).
  const hasDataRef = useRef(false)
  useEffect(() => {
    hasDataRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    let cancelled = false
    const isRefetch = hasDataRef.current

    if (isRefetch) setRefreshing(true)
    else setLoading(true)
    setError(null)

    fetcher()
      .then((res) => {
        if (cancelled) return
        setData(res)
        hasDataRef.current = true
        setLoading(false)
        setRefreshing(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Em refetch silencioso, NÃO apaga o data bom que já está na tela —
        // só registra o erro (e o indicador "atualizado há Xs" para de avançar
        // no próximo sucesso). No primeiro load, propaga normalmente.
        setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
        setLoading(false)
        setRefreshing(false)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey])

  return { data, loading, refreshing, error }
}

// --- Hooks públicos ---

export function useAnalyticsSummary(period: Period = '30d', refreshKey = 0): HookResult<SummaryResponse> {
  return useApiCall(() => analyticsApi.summary(period), [period], refreshKey)
}

export function useAnalyticsFunnel(period: Period = '30d', refreshKey = 0): HookResult<{ data: FunnelDay[] }> {
  return useApiCall(() => analyticsApi.funnel(period), [period], refreshKey)
}

export function useAnalyticsRoiPlatforms(period: Period = '30d', refreshKey = 0): HookResult<{ data: RoiPlatform[] }> {
  return useApiCall(() => analyticsApi.roiPlatforms(period), [period], refreshKey)
}

export function useAnalyticsLeadsRecent(limit = 20, refreshKey = 0): HookResult<{ data: LeadRecent[] }> {
  return useApiCall(() => analyticsApi.leadsRecent(limit), [limit], refreshKey)
}

export function useAnalyticsDispatchesFailed(limit = 20, refreshKey = 0): HookResult<{ data: DispatchFailed[] }> {
  return useApiCall(() => analyticsApi.dispatchesFailed(limit), [limit], refreshKey)
}

export function useAnalyticsChannels(period: Period = '30d', refreshKey = 0): HookResult<{ data: ChannelDay[] }> {
  return useApiCall(() => analyticsApi.channels(period), [period], refreshKey)
}

// Re-export tipos pra componentes que importam daqui
export type { SummaryResponse, FunnelDay, RoiPlatform, LeadRecent, DispatchFailed, ChannelDay, Period }

// Compat: KpiData — removido mock, mantido export de tipo pra não quebrar importações antigas
export type KpiData = SummaryResponse
