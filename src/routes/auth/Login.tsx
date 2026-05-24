// Login — Mentoria Tracking App
// Layout split: hero escuro (esquerda) + form (direita)
// Mock: email "wrong@test.com" simula 401 pra testar UX de erro
// WCAG AA: labels htmlFor, aria-invalid, focus ring

import { useState, useId } from 'react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { authApi } from '@/lib/api'
import { setSession } from '@/lib/auth'

type Props = {
  onLogin?: () => void
  onGoSignup?: () => void
  onGoMagicLink?: () => void
}

export function Login({ onLogin, onGoSignup, onGoMagicLink }: Props) {
  const uid = useId()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const errors = {
    email:
      touched.email && !email.trim()
        ? 'E-mail obrigatorio'
        : touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          ? 'E-mail invalido'
          : undefined,
    senha: touched.senha && !senha ? 'Senha obrigatoria' : undefined,
  }

  function blur(field: string) {
    setTouched((t) => ({ ...t, [field]: true }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ email: true, senha: true })
    setServerError(null)

    if (errors.email || errors.senha || !email || !senha) return

    setLoading(true)
    try {
      const res = await authApi.login(email, senha)

      setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + res.expires_in,
      })

      toast('Bem-vindo de volta!', 'success')
      await new Promise((r) => setTimeout(r, 300))
      onLogin?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao fazer login'
      if (msg.includes('incorretos') || msg.includes('401') || msg.includes('Unauthorized')) {
        setServerError('E-mail ou senha incorretos.')
      } else {
        setServerError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Hero esquerdo — dark sidebar */}
      <div
        className="hidden md:flex md:w-[420px] lg:w-[480px] shrink-0 flex-col justify-between p-10"
        style={{
          background:
            'radial-gradient(ellipse at top left, rgba(22,223,111,0.14) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(0,169,157,0.08) 0%, transparent 50%), #11131A',
        }}
        aria-hidden="true"
      >
        <div className="flex items-center gap-2">
          <Logo variant="green" size="md" />
          <span className="text-caption font-mono text-fg-on-dark-subtle uppercase tracking-widest ml-1">
            Tracking
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-display-lg font-bold text-fg-on-dark leading-tight">
            Painel do<br />Anunciante.
          </h1>
          <p className="text-body-md text-fg-on-dark-muted max-w-xs">
            Leads, conversoes e ROAS de todas as plataformas em um so lugar.
          </p>
        </div>

        <p className="text-caption text-fg-on-dark-subtle">
          Mentoria Tracking &middot; Era 1
        </p>
      </div>

      {/* Form direito */}
      <div
        className="flex-1 flex items-center justify-center p-6 md:p-12"
        style={{ background: 'var(--bg-dark, #0A0A0A)' }}
      >
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="flex md:hidden flex-col items-center gap-1 mb-8">
            <Logo variant="green" size="lg" />
            <span className="text-caption text-fg-on-dark-subtle">Mentoria Tracking</span>
          </div>

          <div
            className="rounded-xl border p-8"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <h2 className="text-h3 font-semibold text-fg-on-dark mb-6">Entrar</h2>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <Field
                id={`${uid}-email`}
                label="E-mail"
                type="email"
                autoComplete="email"
                required
                placeholder="escola@dominio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => blur('email')}
                error={errors.email}
              />

              <Field
                id={`${uid}-senha`}
                label="Senha"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onBlur={() => blur('senha')}
                error={errors.senha}
              />

              {/* Lembrar de mim */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="h-4 w-4 rounded border border-white/20 bg-white/[0.04] text-brand-green accent-brand-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
                />
                <span className="text-body-sm text-fg-on-dark-muted group-hover:text-fg-on-dark transition-colors">
                  Lembrar de mim
                </span>
              </label>

              {/* Erro de servidor (401) */}
              {serverError && (
                <p role="alert" className="text-caption text-red-400 -mt-1">
                  {serverError}
                </p>
              )}

              <Button type="submit" loading={loading} className="w-full mt-2">
                Entrar
              </Button>
            </form>

            <div className="mt-4 flex flex-col gap-2 text-center">
              <button
                type="button"
                onClick={onGoMagicLink}
                className="text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
              >
                Entrar com link magico
              </button>
              <button
                type="button"
                onClick={onGoSignup}
                className="text-body-sm text-fg-on-dark-muted hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
              >
                Nao tem conta?{' '}
                <span className="text-brand-green font-medium">Cadastre-se gratis</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
