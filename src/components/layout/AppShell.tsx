// AppShell — Mentoria Tracking App
// Shell dark grafite com sidebar fixa (desktop) + drawer mobile.
// Spotlight global rAF-throttled (mesma implementação do ERP, WCAG 2.3.3 guard).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileSidebar } from './MobileSidebar'

type Props = {
  activePath?: string
  onNavigate?: (href: string) => void
  children: ReactNode
}

export function AppShell({ activePath, onNavigate, children }: Props) {
  const mainRef = useRef<HTMLDivElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleSelect = useCallback(
    (href: string) => {
      onNavigate?.(href)
      setDrawerOpen(false)
    },
    [onNavigate],
  )

  // Spotlight rAF-throttled — guard reduced-motion
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let rafId = 0
    let pendingX = -300
    let pendingY = -300
    let scheduled = false
    const flush = () => {
      main.style.setProperty('--gx', `${pendingX}px`)
      main.style.setProperty('--gy', `${pendingY}px`)
      scheduled = false
    }
    const handler = (e: MouseEvent) => {
      const r = main.getBoundingClientRect()
      pendingX = e.clientX - r.left
      pendingY = e.clientY - r.top
      if (!scheduled) { scheduled = true; rafId = requestAnimationFrame(flush) }
    }
    const leave = () => {
      pendingX = -300
      pendingY = -300
      if (!scheduled) { scheduled = true; rafId = requestAnimationFrame(flush) }
    }
    main.addEventListener('mousemove', handler, { passive: true })
    main.addEventListener('mouseleave', leave)
    return () => {
      cancelAnimationFrame(rafId)
      main.removeEventListener('mousemove', handler)
      main.removeEventListener('mouseleave', leave)
    }
  }, [])

  return (
    <div
      className="h-screen flex text-fg-on-dark overflow-hidden"
      style={{ background: 'var(--app-bg)' }}
    >
      {/* Skip-link a11y */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-brand-green focus:text-brand-black focus:px-4 focus:py-2 focus:rounded-md focus:font-semibold focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand-black"
      >
        Pular para conteúdo
      </a>

      {/* Desktop Sidebar */}
      <Sidebar activePath={activePath} onSelect={handleSelect} />

      {/* Mobile Sidebar drawer */}
      <MobileSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar activePath={activePath} onSelect={handleSelect} inDrawer />
      </MobileSidebar>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onMenuOpen={() => setDrawerOpen(true)} />

        {/* Scrollable content */}
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-6 outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
