import { useEffect, useState, type ReactNode } from 'react'
import { SpotlightCtx, SPOTLIGHT_KEY } from './spotlight-context'

export { useSpotlight } from './spotlight-context'

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem(SPOTLIGHT_KEY)
    return saved === null ? true : saved === 'on'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-spotlight', enabled ? 'on' : 'off')
    localStorage.setItem(SPOTLIGHT_KEY, enabled ? 'on' : 'off')
  }, [enabled])

  const setEnabled = (v: boolean) => setEnabledState(v)
  const toggle = () => setEnabledState((v) => !v)

  return (
    <SpotlightCtx.Provider value={{ enabled, toggle, setEnabled }}>
      {children}
    </SpotlightCtx.Provider>
  )
}
