// Toast — substitui window.alert() nativo (DESIGN.md v1.3 §UX, ADR — Squad FIX B2 10/05/2026)
// Uso:
//   const { toast } = useToast()
//   toast('Salvo com sucesso', 'success')
//   toast('Erro ao demitir: ' + e, 'error')

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle, XCircle, Info, Warning, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

type ToastItem = {
  id: number
  msg: string
  kind: ToastKind
  durMs: number
}

type ToastApi = {
  toast: (msg: string, kind?: ToastKind, durMs?: number) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}

const KIND_STYLES: Record<
  ToastKind,
  { bar: string; icon: ReactNode; aria: 'polite' | 'assertive' }
> = {
  success: {
    bar: 'border-brand-green/40 bg-brand-black/95 text-fg-on-dark',
    icon: <CheckCircle size={20} weight="fill" className="text-brand-green shrink-0" />,
    aria: 'polite',
  },
  error: {
    bar: 'border-red-500/40 bg-brand-black/95 text-fg-on-dark',
    icon: <XCircle size={20} weight="fill" className="text-red-500 shrink-0" />,
    aria: 'assertive',
  },
  warning: {
    bar: 'border-amber-500/40 bg-brand-black/95 text-fg-on-dark',
    icon: <Warning size={20} weight="fill" className="text-amber-500 shrink-0" />,
    aria: 'polite',
  },
  info: {
    bar: 'border-white/15 bg-brand-black/95 text-fg-on-dark',
    icon: <Info size={20} weight="fill" className="text-fg-on-dark-muted shrink-0" />,
    aria: 'polite',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setQueue((q) => q.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((msg: string, kind: ToastKind = 'info', durMs = 4000) => {
    idRef.current += 1
    const item: ToastItem = { id: idRef.current, msg, kind, durMs }
    setQueue((q) => [...q, item])
  }, [])

  const api = useMemo<ToastApi>(() => ({ toast }), [toast])

  // 1 toast visível por vez (queue FIFO)
  const visible = queue[0] ?? null

  useEffect(() => {
    if (!visible) return
    const t = window.setTimeout(() => dismiss(visible.id), visible.durMs)
    return () => window.clearTimeout(t)
  }, [visible, dismiss])

  const style = visible ? KIND_STYLES[visible.kind] : null

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {visible && style && (
        <div className="fixed bottom-6 right-6 z-toast pointer-events-none animate-fade-up">
          <div
            role="status"
            aria-live={style.aria}
            className={cn(
              'pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[420px]',
              'rounded-lg border backdrop-blur shadow-lg px-4 py-3',
              style.bar,
            )}
          >
            {style.icon}
            <span className="flex-1 text-body-sm leading-snug pt-0.5">{visible.msg}</span>
            <button
              type="button"
              aria-label="Fechar notificação"
              onClick={() => dismiss(visible.id)}
              className="text-fg-on-dark-muted hover:text-fg-on-dark transition-colors p-0.5 -mr-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}
