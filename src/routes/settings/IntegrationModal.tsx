// IntegrationModal — form especifico por plataforma + testar conexao + salvar
// Reusa Field/Button/Toast. Focus trap + Esc. Mock: localStorage[platform_id_status].
// Wrapper aplica guard; body recebe id+meta nao-null (TS narrowing limpo).

import { useEffect, useRef, useState, useId } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { X, ClipboardText, Question } from '@phosphor-icons/react'
import type { PlatformId, PlatformMeta } from './platforms'
import { PLATFORM_META } from './platforms'

type Props = {
  platformId: PlatformId | null
  onClose: () => void
  onSaved: (id: PlatformId, status: 'configured_not_validated' | 'configured_validated') => void
}

export function IntegrationModal({ platformId, onClose, onSaved }: Props) {
  if (!platformId) return null
  const meta = PLATFORM_META[platformId]
  return <ModalBody platformId={platformId} meta={meta} onClose={onClose} onSaved={onSaved} />
}

type BodyProps = {
  platformId: PlatformId
  meta: PlatformMeta
  onClose: () => void
  onSaved: (id: PlatformId, status: 'configured_not_validated' | 'configured_validated') => void
}

function ModalBody({ platformId, meta, onClose, onSaved }: BodyProps) {
  const ref = useRef<HTMLDivElement>(null)
  const uid = useId()
  const { toast } = useToast()
  useFocusTrap(ref, true, onClose)

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of meta.fields) {
      const stored = localStorage.getItem(`mentoria-tracking.cred.${platformId}.${f.key}`)
      initial[f.key] = stored ?? f.defaultValue ?? ''
    }
    return initial
  })
  const [helpOpen, setHelpOpen] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Lock scroll body
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function setField(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }))
  }

  async function copyValue(key: string) {
    const v = values[key] ?? ''
    if (!v) return
    try {
      await navigator.clipboard.writeText(v)
      toast('Copiado!', 'success', 2000)
    } catch {
      toast('Falha ao copiar', 'error')
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      await new Promise((r) => setTimeout(r, 1500))
      // Mock: ~67% sucesso (baseado em length % 3)
      const success = platformId.length % 3 !== 0
      if (success) {
        toast('Conexao OK! Credenciais validadas.', 'success')
      } else {
        toast('Erro na conexao. Verifique os tokens.', 'error', 5000)
      }
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    const missing = meta.fields.filter((f) => f.required && !values[f.key]?.trim())
    if (missing.length) {
      toast(`Preencha: ${missing.map((m) => m.label).join(', ')}`, 'warning')
      return
    }
    setSaving(true)
    try {
      await new Promise((r) => setTimeout(r, 600))
      for (const f of meta.fields) {
        if (values[f.key]) {
          localStorage.setItem(`mentoria-tracking.cred.${platformId}.${f.key}`, values[f.key])
        }
      }
      const status: 'configured_not_validated' = 'configured_not_validated'
      localStorage.setItem(`mentoria-tracking.cred.${platformId}.status`, status)
      localStorage.setItem(`mentoria-tracking.cred.${platformId}.last_validated`, new Date().toISOString())
      toast(`${meta.label} configurado! Lembre de testar a conexao.`, 'success')
      onSaved(platformId, status)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[40] flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 5, 8, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="w-full max-w-lg rounded-2xl border max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--app-bg, #1a1a1a)',
          borderColor: 'var(--app-card-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between p-6 pb-4 sticky top-0 z-10"
          style={{ background: 'var(--app-bg, #1a1a1a)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">{meta.emoji}</span>
            <div>
              <h2 id={`${uid}-title`} className="text-h3 font-semibold text-fg-on-dark">
                {meta.label}
              </h2>
              <p className="text-body-sm text-fg-on-dark-muted">{meta.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            data-autofocus
            className="text-fg-on-dark-muted hover:text-fg-on-dark transition-colors p-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 flex flex-col gap-4">
          {meta.fields.map((f) => (
            <div key={f.key}>
              <Field
                id={`${uid}-${f.key}`}
                label={f.label + (f.required ? ' *' : '')}
                type={f.secret ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                hint={f.hint}
                readOnly={f.readOnly}
                suffix={
                  <div className="flex items-center gap-2">
                    {f.copyable && (
                      <button
                        type="button"
                        onClick={() => copyValue(f.key)}
                        aria-label={`Copiar ${f.label}`}
                        className="text-fg-on-dark-subtle hover:text-brand-green transition-colors p-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
                      >
                        <ClipboardText size={14} />
                      </button>
                    )}
                    {f.help && (
                      <button
                        type="button"
                        onClick={() => setHelpOpen(helpOpen === f.key ? null : f.key)}
                        aria-label={`Como pegar ${f.label}?`}
                        aria-expanded={helpOpen === f.key}
                        className="text-caption text-brand-green hover:text-brand-green/80 transition-colors inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
                      >
                        <Question size={12} weight="bold" />
                        Como pegar?
                      </button>
                    )}
                  </div>
                }
              />
              {helpOpen === f.key && f.help && (
                <div
                  className="mt-2 p-3 rounded-md border text-body-sm text-fg-on-dark-muted"
                  style={{ background: 'var(--app-pill-bg)', borderColor: 'var(--app-pill-border)' }}
                  role="region"
                  aria-label={`Instrucoes ${f.label}`}
                >
                  <p className="whitespace-pre-line">{f.help}</p>
                  <div className="mt-2 h-24 rounded bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center text-caption text-fg-on-dark-subtle">
                    Screenshot placeholder (sprint 2)
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--app-card-border)' }}
        >
          <Button variant="ghost" onClick={handleTest} loading={testing} disabled={testing || saving}>
            Testar conexao
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving} disabled={testing || saving}>Salvar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
