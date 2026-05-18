// PromptDialog — substitui window.prompt() nativo (Squad FIX B2, 10/05/2026)
// Uso: const prompt = usePrompt(); const v = await prompt({ title, multiline, minLength })
// v === null = cancelado; senão = string trimada.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useFocusTrap } from '@/lib/useFocusTrap'

export type PromptOpts = {
  title: string
  message?: string
  placeholder?: string
  minLength?: number
  multiline?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

type PromptApi = (opts: PromptOpts) => Promise<string | null>
const PromptCtx = createContext<PromptApi | null>(null)

export function usePrompt(): PromptApi {
  const ctx = useContext(PromptCtx)
  if (!ctx) throw new Error('usePrompt precisa estar dentro de <PromptProvider>')
  return ctx
}

type PendingState = { opts: PromptOpts; resolve: (v: string | null) => void }

export function PromptProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  const [value, setValue] = useState('')
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const prompt = useCallback<PromptApi>((opts) => {
    setValue('')
    return new Promise<string | null>((resolve) => setPending({ opts, resolve }))
  }, [])

  const close = useCallback(
    (result: string | null) => {
      if (!pending) return
      pending.resolve(result)
      setPending(null)
      setValue('')
    },
    [pending],
  )

  // Esc cancela + focus trap (Squad A11y FIX P0, 11/05/2026)
  useFocusTrap(dialogRef, !!pending, () => close(null))

  const api = useMemo<PromptApi>(() => prompt, [prompt])
  const opts = pending?.opts
  const min = opts?.minLength ?? 1
  const trimmed = value.trim()
  const valid = trimmed.length >= min
  const showError = value.length > 0 && !valid
  const inputClasses =
    'w-full px-3 rounded-md border border-border-default bg-white text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green'

  return (
    <PromptCtx.Provider value={api}>
      {children}
      {pending && opts && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => close(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-modal-backdrop cursor-default"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-title"
            className="relative z-modal w-full max-w-md rounded-xl bg-white text-fg-on-light shadow-xl border border-border-default overflow-hidden animate-fade-up"
          >
            <div className="p-6">
              <h2 id="prompt-title" className="text-h4 font-semibold text-brand-black">
                {opts.title}
              </h2>
              {opts.message && (
                <p className="mt-1.5 text-body-sm text-fg-on-light-muted leading-relaxed">
                  {opts.message}
                </p>
              )}
              <div className="mt-4">
                {opts.multiline ? (
                  <textarea
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={opts.placeholder}
                    rows={3}
                    className={`${inputClasses} py-2 resize-y`}
                  />
                ) : (
                  <input
                    type="text"
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && valid) {
                        e.preventDefault()
                        close(trimmed)
                      }
                    }}
                    placeholder={opts.placeholder}
                    className={`${inputClasses} h-10`}
                  />
                )}
                {showError && (
                  <p className="mt-1 text-caption text-danger-text">
                    Mínimo {min} {min === 1 ? 'caractere' : 'caracteres'}.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-bg-content border-t border-border-subtle">
              <button
                type="button"
                onClick={() => close(null)}
                className="h-10 px-4 rounded-md text-body-sm font-medium text-brand-black hover:bg-bg-muted active:bg-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              >
                {opts.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => valid && close(trimmed)}
                disabled={!valid}
                className="h-10 px-5 rounded-md text-body-sm font-semibold transition-colors shadow-xs bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              >
                {opts.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PromptCtx.Provider>
  )
}
