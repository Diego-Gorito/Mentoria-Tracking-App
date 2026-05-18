import { useEffect, type RefObject } from 'react'

/**
 * Focus trap pra modais/drawers. Captura Tab/Shift+Tab nas bordas do container.
 * Foco inicial: primeiro [data-autofocus] OU primeiro focusable.
 * Esc → onEscape (opcional).
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isActive: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!isActive) return
    const container = containerRef.current
    if (!container) return

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    function getFocusable(): HTMLElement[] {
      if (!container) return []
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('aria-hidden'),
      )
    }

    const autoFocus = container.querySelector<HTMLElement>('[data-autofocus]')
    if (autoFocus) {
      autoFocus.focus()
    } else {
      const first = getFocusable()[0]
      first?.focus()
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = getFocusable()
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKey)
    return () => container.removeEventListener('keydown', handleKey)
  }, [containerRef, isActive, onEscape])
}
