// MobileSidebar — drawer mobile pra Tracking App.
// Mesmo padrão a11y do ERP (focus trap, aria-hidden no main, Esc fecha).

import { useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function MobileSidebar({ open, onClose, children }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => closeButtonRef.current?.focus(), 30)
    return () => clearTimeout(id)
  }, [open])

  // Focus trap
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const getFocusable = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // aria-hidden no main
  useEffect(() => {
    const main = document.getElementById('main-content')
    if (open) {
      main?.setAttribute('aria-hidden', 'true')
      main?.setAttribute('inert', '')
    } else {
      main?.removeAttribute('aria-hidden')
      main?.removeAttribute('inert')
    }
    return () => {
      main?.removeAttribute('aria-hidden')
      main?.removeAttribute('inert')
    }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-modal-backdrop transition-opacity duration-base md:hidden',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className={cn(
          'fixed inset-y-0 left-0 z-modal w-[280px] flex flex-col transition-transform duration-base md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: 'var(--app-sidebar-bg)' }}
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-body-sm font-semibold text-fg-on-dark">Menu</span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-fg-on-dark-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content (Sidebar inDrawer) */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}
