/**
 * useMetaIntegration — estado + chamadas do conector Meta Ads (paste de System
 * User Token, MVP sem OAuth).
 *
 * Endpoints consumidos:
 *   GET    /api/meta/status        → estado da conexão
 *   POST   /api/meta/connect       → valida token + cifra → ad accounts
 *   GET    /api/meta/pixels        → pixels da ad account selecionada
 *   POST   /api/meta/select        → grava seleção + escreve pixel no container
 *   DELETE /api/meta/disconnect    → revoga
 *
 * @see workers/api/meta.ts
 */

import { useCallback, useEffect, useState } from 'react'
import {
  metaApi,
  type MetaAdAccountView,
  type MetaPixelView,
  type MetaStatus,
} from '@/lib/api'

/** Passo do wizard. A=guia, B=token, C=seleção, D=done. */
export type MetaWizardStep = 'guide' | 'token' | 'select' | 'done'

export function useMetaIntegration() {
  const [status, setStatus] = useState<MetaStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [step, setStep] = useState<MetaWizardStep>('guide')

  const [adAccounts, setAdAccounts] = useState<MetaAdAccountView[]>([])
  const [pixels, setPixels] = useState<MetaPixelView[]>([])

  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [pixelsLoading, setPixelsLoading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectError, setSelectError] = useState<string | null>(null)
  const [containerSynced, setContainerSynced] = useState<boolean | null>(null)
  const [syncDetail, setSyncDetail] = useState<string | undefined>(undefined)

  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  // Carrega status no mount. Se já conectado com pixel, pula direto pro done.
  useEffect(() => {
    let cancelled = false
    setStatusLoading(true)
    setStatusError(null)
    metaApi
      .status()
      .then((s) => {
        if (cancelled) return
        setStatus(s)
        if (s.connected && s.pixel_id) {
          setStep('done')
        }
        setStatusLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setStatusError(err.message)
        setStatusLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  /** Step B → valida token, guarda ad accounts, avança pro select. */
  const connect = useCallback(async (token: string): Promise<boolean> => {
    setConnecting(true)
    setConnectError(null)
    try {
      const resp = await metaApi.connect(token.trim())
      setAdAccounts(resp.ad_accounts)
      setStep('select')
      return true
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setConnecting(false)
    }
  }, [])

  /** Step C → carrega pixels de uma ad account. */
  const loadPixels = useCallback(async (adAccountId: string): Promise<void> => {
    setPixelsLoading(true)
    setSelectError(null)
    setPixels([])
    try {
      const resp = await metaApi.pixels(adAccountId)
      setPixels(resp.pixels)
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : String(err))
    } finally {
      setPixelsLoading(false)
    }
  }, [])

  /** Step C → grava seleção + escreve pixel no container, avança pro done. */
  const selectPixel = useCallback(
    async (adAccountId: string, pixelId: string): Promise<boolean> => {
      setSelecting(true)
      setSelectError(null)
      try {
        const resp = await metaApi.select(adAccountId, pixelId)
        setContainerSynced(resp.container_synced)
        setSyncDetail(resp.detail)
        setStep('done')
        refresh()
        return true
      } catch (err) {
        setSelectError(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setSelecting(false)
      }
    },
    [refresh],
  )

  const disconnect = useCallback(async (): Promise<void> => {
    await metaApi.disconnect()
    setAdAccounts([])
    setPixels([])
    setContainerSynced(null)
    setSyncDetail(undefined)
    setStep('guide')
    refresh()
  }, [refresh])

  return {
    // status
    status,
    statusLoading,
    statusError,
    refresh,
    // wizard
    step,
    setStep,
    // step B
    connect,
    connecting,
    connectError,
    // step C
    adAccounts,
    pixels,
    pixelsLoading,
    loadPixels,
    selectPixel,
    selecting,
    selectError,
    // step D
    containerSynced,
    syncDetail,
    // teardown
    disconnect,
  }
}
