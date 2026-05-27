/**
 * useGtmContainer — query status do GTM container do tenant atual.
 *
 * Endpoints consumidos:
 *   GET  /api/gtm/tenant-container/:tenant_slug  → status atual
 *   GET  /api/gtm/master-versions                → versões disponíveis
 *   POST /api/gtm/provision-container            → cria 2 containers
 *   POST /api/gtm/republish/:tenant_slug         → diff sync
 *
 * @see ADR-0009 GTM Master Clone Architecture
 */

import { useCallback, useEffect, useState } from 'react'
import { useTenant } from './useTenant'
import { gtmApi } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GtmContainerStatus =
  | 'not_provisioned'
  | 'pending'
  | 'cloning'
  | 'linking'
  | 'publishing'
  | 'active'
  | 'failed'
  | 'archived'

export interface GtmContainerInfo {
  status: GtmContainerStatus
  sgtm_url?: string | null
  web_container_public_id?: string | null
  web_container_internal_id?: string | null
  server_container_public_id?: string | null
  server_container_internal_id?: string | null
  created_at?: string | null
  last_published_at?: string | null
  failed_at_step?: string | null
  error_message?: string | null
  master_version?: { version_name: string; snapshot_at: string }
  tenant_id?: string
}

export interface GtmMasterVersion {
  id: string
  version_name: string
  snapshot_at: string
  notes?: string | null
  is_current: boolean
}

export interface ProvisionPayload {
  tenant_slug: string
  pixel_ids?: Partial<Record<PlatformKey, string>>
  webhook_secrets?: { kiwify?: string; kirvano?: string; stripe?: string }
}

export type PlatformKey =
  | 'meta'
  | 'ga4_web'
  | 'ga4_server'
  | 'bing'
  | 'x'
  | 'reddit'
  | 'pinterest'
  | 'snap'
  | 'quora'
  | 'clarity'
  | 'tiktok'
  | 'linkedin'
  | 'taboola'
  | 'outbrain'
  | 'google_ads_conversion'
  | 'google_ads_remarketing'

export interface ProvisionResult {
  tenant_id: string
  web_container: { public_id: string; internal_id: string; snippet: string }
  server_container: { public_id: string; internal_id: string; url: string }
  master_version: string
}

export interface RepublishResult {
  tenant_id: string
  status: 'updated' | 'already_current' | 'no_changes'
  from_version: string
  to_version: string
  counts: {
    web: SyncCountsView
    server: SyncCountsView
  }
  warnings: string[]
}

export interface SyncCountsView {
  templates: { created: number; updated: number; skipped: number }
  variables: { created: number; updated: number; preserved_value: number; skipped: number }
  triggers: { created: number; updated: number; skipped: number }
  clients: { created: number; updated: number; skipped: number }
  tags: { created: number; updated: number; skipped: number }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGtmContainer() {
  const { tenant, loading: tenantLoading } = useTenant()
  const [info, setInfo] = useState<GtmContainerInfo | null>(null)
  const [versions, setVersions] = useState<GtmMasterVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (tenantLoading) return
    if (!tenant?.slug) {
      setInfo(null)
      setVersions([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      gtmApi.getStatus(tenant.slug),
      gtmApi.listMasterVersions(),
    ])
      .then(([containerInfo, versionsResp]) => {
        if (cancelled) return
        setInfo(containerInfo as GtmContainerInfo)
        setVersions(versionsResp.versions ?? [])
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tenant?.slug, tenantLoading, tick])

  const currentMaster = versions.find((v) => v.is_current) ?? null
  const isOutdated =
    info?.status === 'active' &&
    info?.master_version &&
    currentMaster &&
    info.master_version.version_name !== currentMaster.version_name

  const provision = useCallback(
    async (payload: ProvisionPayload): Promise<ProvisionResult> => {
      const result = await gtmApi.provision({
        tenant_slug: payload.tenant_slug,
        pixel_ids: payload.pixel_ids as Record<string, string> | undefined,
        webhook_secrets: payload.webhook_secrets,
      })
      refresh()
      return result
    },
    [refresh],
  )

  const republish = useCallback(
    async (autoPublish = true): Promise<RepublishResult> => {
      if (!tenant?.slug) throw new Error('No tenant')
      const result = await gtmApi.republish(tenant.slug, { autoPublish })
      refresh()
      return result
    },
    [tenant?.slug, refresh],
  )

  return {
    info,
    versions,
    currentMaster,
    isOutdated,
    loading,
    error,
    refresh,
    provision,
    republish,
  }
}
