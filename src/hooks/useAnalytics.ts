// useAnalytics — lê dados da view analytics.* via Worker /api/query/:name.
// TODO: implementar com queryApi.run (Era 1 sprint 3 — dashboard).

import { useState, useEffect } from 'react'
import { useTenant } from './useTenant'

export type KpiData = {
  totalLeads: number
  totalConversions: number
  totalRevenueBrl: number
  totalSpendBrl: number
  roas: number
  cpl: number
  dispatchHealthPct: number
}

const MOCK_KPI: KpiData = {
  totalLeads: 0,
  totalConversions: 0,
  totalRevenueBrl: 0,
  totalSpendBrl: 0,
  roas: 0,
  cpl: 0,
  dispatchHealthPct: 0,
}

export function useKpis(_windowDays = 30): {
  data: KpiData | null
  loading: boolean
  error: string | null
} {
  const { tenant } = useTenant()
  const [data, setData] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenant) {
      setLoading(false)
      return
    }

    // TODO: substituir por queryApi.run('kpi_summary', tenant.tenantId, { windowDays: _windowDays })
    setData(MOCK_KPI)
    setLoading(false)
    setError(null)
  }, [tenant, _windowDays])

  return { data, loading, error }
}
