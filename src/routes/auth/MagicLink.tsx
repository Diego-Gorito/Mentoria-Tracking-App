// MagicLink — Mentoria Tracking App
// Form simples: email -> submit mock -> tela de confirmacao com cooldown 30s
// WCAG AA: labels, aria-live no estado enviado, focus visivel
// Reusa Field + Button + Toast

import { useState, useId, useEffect } from 'react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { EnvelopeOpen } from '@phosphor-icons/react'

const COOLDOWN_SECONDS = 30

type Props = {
  onGoLogin?: () => void
}

function validateEmail(v: string): string | undefined {
  if (!v.trim()) return 'E-mail obrigatorio'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'E-mail invalido'
}

export function MagicLink({ onGoLogin }: Props) {
  const uid = useId()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const emailError = touched ? validateEmail(email) : undefined

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (validateEmail(email)) return

    setLoading(true)
    try {
      // Mock: simula POST /api/auth/magic-link
      // eslint-disable-next-line no-console
      console.log('[MagicLink] mock send to:', email)
      await new Promise((r) => setTimeout(r, 700))
      toast(`Link enviado pra ${email}! Verifique sua caixa de entrada (valido por 15min)`, 'success', 6000)
      setSent(true)
      setCooldown(COOLDOWN_SECONDS)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setLoading(true)
    try {
      // eslint-disable-next-line no-console
      console.log('[MagicLink] mock resend to:', email)
      await new Promise((r) => setTimeout(r, 500))
      toast(`Novo link enviado pra ${email}`, 'success')
      setCooldown(COOLDOWN_SECONDS)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-dark, #0A0A0A)' }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <Logo variant="green" size="lg" />
          <span className="text-caption text-fg-on-dark-subtle">Mentoria Tracking</span>
        </div>

        <div
          className="rounded-xl border p-8"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          {sent ? (
            <div className="text-center" role="status" aria-live="polite">
              <div
                className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green/10 border border-brand-green/20 mb-4"
                aria-hidden="true"
              >
                <EnvelopeOpen size={28} weight="duotone" className="text-brand-green" />
              </div>
              <h1 className="text-h3 font-semibold text-fg-on-dark mb-2">
                Verifique seu e-mail
              </h1>
              <p className="text-body-sm text-fg-on-dark-muted mb-6">
                Enviamos um link de acesso para{' '}
                <span className="text-fg-on-dark font-medium break-all">{email}</span>.
                <br />
                O link expira em <strong className="text-fg-on-dark">15 minutos</strong>.
              </p>

              <Button
                type="button"
                variant="secondary"
                onClick={handleResend}
                loading={loading}
                disabled={cooldown > 0 || loading}
                className="w-full"
              >
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar link'}
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-h3 font-semibold text-fg-on-dark mb-2">
                Link magico
              </h1>
              <p className="text-body-sm text-fg-on-dark-muted mb-6">
                Receba um link de acesso por e-mail, sem precisar de senha.
              </p>

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                <Field
                  id={`${uid}-email`}
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@dominio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  error={emailError}
                  hint={!emailError ? 'Voce recebera um link de acesso em segundos' : undefined}
                />

                <Button type="submit" loading={loading} className="w-full mt-2">
                  Enviar link magico
                </Button>
              </form>
            </>
          )}

          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <button
              type="button"
              onClick={onGoLogin}
              className="text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
