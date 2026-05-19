// useOnboarding.ts — estado e ações do wizard de onboarding
// Carrega state do servidor na montagem. Encapsula: getState, checkSlug (debounced),
// uploadLogo, saveStepN, complete (→ redireciona /dashboard).
// Debounce de checkSlug: 400ms (spec Uma).

import { useCallback, useEffect, useRef, useState } from 'react'
import { onboardingApi, type OnboardingState } from '@/lib/api'

export type SlugCheckResult =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; suggestion?: string }
  | { status: 'error' }

type OnboardingActions = {
  checkSlug: (slug: string) => void
  uploadLogo: (file: File, slug: string) => Promise<string | null>
  createTenant: (data: { slug: string; name: string }) => Promise<boolean>
  saveStep1: (data: { name: string; slug: string; url?: string; logo_url?: string; brand_color: string }) => Promise<boolean>
  saveStep2: (trackingVerified: boolean) => Promise<boolean>
  saveStep3: (sources: string[], formPlatform?: string) => Promise<boolean>
  saveStep4: (platformsConfigured: string[]) => Promise<boolean>
  complete: () => Promise<boolean>
  resetSlugCheck: () => void
}

type UseOnboardingReturn = {
  state: OnboardingState
  loading: boolean
  saving: boolean
  error: string | null
  slugCheck: SlugCheckResult
  actions: OnboardingActions
}

export function useOnboarding(): UseOnboardingReturn {
  const [state, setState] = useState<OnboardingState>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugCheck, setSlugCheck] = useState<SlugCheckResult>({ status: 'idle' })
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carrega estado inicial do servidor
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const s = await onboardingApi.getState()
        if (!cancelled) setState(s)
      } catch {
        // getState pode retornar null se tenant ainda não existe — não é erro fatal
        if (!cancelled) setState(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // checkSlug debounced 400ms
  const checkSlug = useCallback((slug: string) => {
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current)
    if (!slug || slug.length < 3) {
      setSlugCheck({ status: 'idle' })
      return
    }
    setSlugCheck({ status: 'checking' })
    slugDebounceRef.current = setTimeout(async () => {
      try {
        const result = await onboardingApi.checkSlug(slug)
        if (result.available) {
          setSlugCheck({ status: 'available' })
        } else {
          setSlugCheck({ status: 'unavailable', suggestion: result.suggestion })
        }
      } catch {
        setSlugCheck({ status: 'error' })
      }
    }, 400)
  }, [])

  const resetSlugCheck = useCallback(() => {
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current)
    setSlugCheck({ status: 'idle' })
  }, [])

  const uploadLogo = useCallback(async (file: File, slug: string): Promise<string | null> => {
    try {
      const { url } = await onboardingApi.uploadLogo(file, slug)
      return url
    } catch {
      return null
    }
  }, [])

  // B3 fix: cria tenant antes de salvar step 1 quando user é novo
  const createTenant = useCallback(async (data: { slug: string; name: string }): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      const result = await onboardingApi.createTenant(data)
      setState((prev) => prev
        ? { ...prev, tenant_id: result.tenant_id, slug: result.slug }
        : {
            tenant_id: result.tenant_id,
            slug: result.slug,
            name: data.name,
            onboarding_step: result.onboarding_step,
            onboarding_data: {},
            completed_at: null,
          },
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo falhou ao criar a escola. Tente de novo.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const saveStep1 = useCallback(async (data: {
    name: string; slug: string; url?: string; logo_url?: string; brand_color: string
  }): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await onboardingApi.saveStep1(data)
      setState((prev) => prev
        ? { ...prev, onboarding_step: Math.max(prev.onboarding_step, 1) }
        : prev,
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo falhou ao salvar. Tente de novo.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const saveStep2 = useCallback(async (trackingVerified: boolean): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await onboardingApi.saveStep2({ tracking_verified: trackingVerified })
      setState((prev) => prev
        ? { ...prev, onboarding_step: Math.max(prev.onboarding_step, 2) }
        : prev,
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo falhou ao salvar. Tente de novo.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const saveStep3 = useCallback(async (sources: string[], formPlatform?: string): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await onboardingApi.saveStep3({ sources, form_platform: formPlatform })
      setState((prev) => prev
        ? { ...prev, onboarding_step: Math.max(prev.onboarding_step, 3) }
        : prev,
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo falhou ao salvar. Tente de novo.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const saveStep4 = useCallback(async (platformsConfigured: string[]): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await onboardingApi.saveStep4({ platforms_configured: platformsConfigured })
      setState((prev) => prev
        ? { ...prev, onboarding_step: Math.max(prev.onboarding_step, 4) }
        : prev,
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo falhou ao salvar. Tente de novo.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const complete = useCallback(async (): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await onboardingApi.complete()
      window.location.href = '/dashboard'
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo falhou ao finalizar. Tente de novo.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  return {
    state,
    loading,
    saving,
    error,
    slugCheck,
    actions: {
      checkSlug,
      uploadLogo,
      createTenant,
      saveStep1,
      saveStep2,
      saveStep3,
      saveStep4,
      complete,
      resetSlugCheck,
    },
  }
}
