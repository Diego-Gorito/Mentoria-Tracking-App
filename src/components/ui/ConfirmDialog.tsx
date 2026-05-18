// ConfirmDialog — substitui window.confirm() nativo (Squad FIX B2, 10/05/2026)
// Uso:
//   const confirm = useConfirm()
//   const ok = await confirm({
//     title: 'Demitir Maria?',
//     message: 'Histórico fica preservado.',
//     danger: true,
//     requireText: 'DEMITIR',  // opcional
//   })
//   if (!ok) return

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Warning } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/lib/useFocusTrap'

export type ConfirmOpts = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  requireText?: string
}

type ConfirmApi = (opts: ConfirmOpts) => Promise<boolean>

const ConfirmCtx = createContext<ConfirmApi | null>(null)

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>')
  return ctx
}

type PendingState = {
  opts: ConfirmOpts
  resolve: (v: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  const [typed, setTyped] = useState('')
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const confirm = useCallback<ConfirmApi>((opts) => {
    setTyped('')
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve })
    })
  }, [])

  const close = useCallback(
    (result: boolean) => {
      if (!pending) return
      pending.resolve(result)
      setPending(null)
      setTyped('')
    },
    [pending],
  )

  // Esc = cancelar + focus trap (Squad A11y FIX P0, 11/05/2026)
  useFocusTrap(dialogRef, !!pending, () => close(false))

  const api = useMemo<ConfirmApi>(() => confirm, [confirm])

  const opts = pending?.opts
  const danger = !!opts?.danger
  const needsText = !!opts?.requireText
  const textOk = !needsText || typed.trim() === opts?.requireText
  const confirmLabel = opts?.confirmLabel ?? 'Confirmar'
  const cancelLabel = opts?.cancelLabel ?? 'Cancelar'

  return (
    <ConfirmCtx.Provider value={api}>
      {children}
      {pending && opts && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => close(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-modal-backdrop cursor-default"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="relative z-modal w-full max-w-md rounded-xl bg-white text-fg-on-light shadow-xl border border-border-default overflow-hidden animate-fade-up"
          >
            <div className="p-6">
              <div className="flex items-start gap-3">
                {danger && (
                  <div className="shrink-0 h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                    <Warning size={20} weight="fill" className="text-red-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 id="confirm-title" className="text-h4 font-semibold text-brand-black">
                    {opts.title}
                  </h2>
                  {opts.message && (
                    <p className="mt-1.5 text-body-sm text-fg-on-light-muted leading-relaxed">
                      {opts.message}
                    </p>
                  )}
                  {needsText && (
                    <div className="mt-4">
                      <label className="block text-body-sm text-fg-on-light-muted mb-1.5">
                        Digite{' '}
                        <span className="font-mono font-semibold text-brand-black">
                          {opts.requireText}
                        </span>{' '}
                        para confirmar:
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-border-default bg-white text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-bg-content border-t border-border-subtle">
              <button
                data-autofocus={needsText ? undefined : true}
                type="button"
                onClick={() => close(false)}
                className="h-10 px-4 rounded-md text-body-sm font-medium text-brand-black hover:bg-bg-muted active:bg-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => textOk && close(true)}
                disabled={!textOk}
                className={cn(
                  'h-10 px-5 rounded-md text-body-sm font-semibold transition-colors shadow-xs',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
                  'disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed disabled:shadow-none',
                  danger
                    ? 'bg-danger text-white hover:bg-red-600 active:bg-red-700'
                    : 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
