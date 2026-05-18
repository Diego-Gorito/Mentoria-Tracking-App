import { createContext, useContext } from 'react'

export type SpotlightCtxValue = {
  enabled: boolean
  toggle: () => void
  setEnabled: (v: boolean) => void
}
export const SpotlightCtx = createContext<SpotlightCtxValue | null>(null)
export const SPOTLIGHT_KEY = 'mentoria-tracking.spotlight'

export function useSpotlight() {
  const ctx = useContext(SpotlightCtx)
  if (!ctx) throw new Error('useSpotlight must be inside SpotlightProvider')
  return ctx
}
