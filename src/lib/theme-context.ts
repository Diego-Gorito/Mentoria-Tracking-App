import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'
export type ThemeCtxValue = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }

export const ThemeCtx = createContext<ThemeCtxValue | null>(null)
export const STORAGE_KEY = 'mentoria-tracking.theme'

export function useTheme() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider')
  return ctx
}
