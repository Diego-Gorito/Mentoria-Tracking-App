// Signup — Mentoria Tracking App
// Layout split: hero escuro (esquerda) + form (direita)
// Mocks: fetch /api/auth/signup → toast sucesso → redirect /onboarding
// WCAG AA: labels htmlFor, aria-invalid, focus ring, responsivo mobile-first

import { useState, useId } from 'react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { authApi } from '@/lib/api'
import { setToken, setUser } from '@/lib/auth'

type Props = {
  onSignup?: () => void
  onGoLogin?: () => void
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function validateEmail(v: string): string | undefined {
  if (!v) return 'E-mail obrigatorio'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'E-mail invalido'
}

function validatePassword(v: string): string | undefined {
  if (!v) return 'Senha obrigatoria'
  if (v.length < 8) return 'Minimo 8 caracteres'
  if (!/[A-Z]/.test(v) && !/[0-9]/.test(v)) return 'Use letras e numeros'
}

function passwordStrength(v: string): 'fraca' | 'media' | 'forte' | null {
  if (!v) return null
  const score = [v.length >= 8, /[A-Z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v)].filter(
    Boolean,
  ).length
  if (score <= 1) return 'fraca'
  if (score <= 2) return 'media'
  return 'forte'
}

const STRENGTH_LABEL: Record<'fraca' | 'media' | 'forte', string> = {
  fraca: 'Fraca',
  media: 'Media',
  forte: 'Forte',
}
const STRENGTH_COLOR: Record<'fraca' | 'media' | 'forte', string> = {
  fraca: 'bg-red-500',
  media: 'bg-amber-400',
  forte: 'bg-brand-green',
}
const STRENGTH_WIDTH: Record<'fraca' | 'media' | 'forte', string> = {
  fraca: 'w-1/3',
  media: 'w-2/3',
  forte: 'w-full',
}

export function Signup({ onSignup, onGoLogin }: Props) {
  const uid = useId()
  const { toast } = useToast()

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [senha, setSenha] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)

  const slug = slugify(empresa)
  const strength = passwordStrength(senha)

  // Errors (only shown after touch)
  const errors = {
    nome: touched.nome && !nome.trim() ? 'Nome obrigatorio' : undefined,
    email: touched.email ? validateEmail(email) : undefined,
    empresa: touched.empresa && !empresa.trim() ? 'Nome da empresa obrigatorio' : undefined,
    senha: touched.senha ? validatePassword(senha) : undefined,
  }

  function blur(field: string) {
    setTouched((t) => ({ ...t, [field]: true }))
  }

  const hasErrors = Object.values(errors).some(Boolean)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Marca todos como touched pra mostrar erros
    setTouched({ nome: true, email: true, empresa: true, senha: true })
    if (!nome.trim() || validateEmail(email) || !empresa.trim() || validatePassword(senha)) return

    setLoading(true)
    try {
      const res = await authApi.signup({
        email,
        password: senha,
        name: nome.trim(),
        tenant_slug: slug || undefined,
      })

      // Persiste JWT + user info
      setToken(res.token)
      setUser({
        id: res.user_id,
        email: res.email,
        tenantId: res.tenant_slug ?? '',
        tenantSlug: res.tenant_slug ?? '',
        tenantName: res.tenant_name ?? '',
        role: (res.role as 'owner' | 'admin' | 'viewer') ?? 'owner',
      })

      // Mantém dados pra Wizard
      localStorage.setItem('mentoria-tracking.signup-name', nome.trim())
      localStorage.setItem('mentoria-tracking.signup-company', empresa.trim())
      localStorage.setItem('mentoria-tracking.signup-slug', res.tenant_slug ?? slug)

      toast('Conta criada com sucesso!', 'success', 5000)
      await new Promise((r) => setTimeout(r, 300))
      onSignup?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar conta'
      toast(msg, 'error', 5000)
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
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Logo variant="green" size="md" />
          <span className="text-caption font-mono text-fg-on-dark-subtle uppercase tracking-widest ml-1">
            Tracking
          </span>
        </div>

        {/* Tagline central */}
        <div className="flex flex-col gap-4">
          <h1 className="text-display-lg font-bold text-fg-on-dark leading-tight">
            Cole 3 tokens,<br />veja ROAS<br />
            <span className="text-brand-green">amanhã.</span>
          </h1>
          <p className="text-body-md text-fg-on-dark-muted max-w-xs">
            Integre Meta CAPI, Hotmart e Google em menos de 30 minutos.
            Sem agencia, sem gambiarra.
          </p>
        </div>

        {/* Rodape hero */}
        <p className="text-caption text-fg-on-dark-subtle">
          Gratis para sempre &middot; Era 1 MVP
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
            <h2 className="text-h3 font-semibold text-fg-on-dark mb-6">Criar conta gratis</h2>

            <form
              id={`${uid}-form`}
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-4"
            >
              <Field
                id={`${uid}-nome`}
                label="Nome completo"
                type="text"
                autoComplete="name"
                required
                placeholder="Joao Silva"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onBlur={() => blur('nome')}
                error={errors.nome}
              />

              <Field
                id={`${uid}-email`}
                label="E-mail"
                type="email"
                autoComplete="email"
                required
                placeholder="voce@dominio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => blur('email')}
                error={errors.email}
              />

              <Field
                id={`${uid}-empresa`}
                label="Escola / Empresa"
                type="text"
                required
                placeholder="Ex: Cursinho Exemplo"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                onBlur={() => blur('empresa')}
                error={errors.empresa}
                hint={
                  empresa
                    ? `Slug: ${slug || '—'}`
                    : 'Slug gerado automaticamente'
                }
              />

              {/* Senha + indicador de forca */}
              <div className="flex flex-col gap-1.5">
                <Field
                  id={`${uid}-senha`}
                  label="Senha"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Minimo 8 caracteres"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onBlur={() => blur('senha')}
                  error={errors.senha}
                />
                {strength && !errors.senha && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-base ${STRENGTH_COLOR[strength]} ${STRENGTH_WIDTH[strength]}`}
                      />
                    </div>
                    <span className="text-caption text-fg-on-dark-subtle w-10">
                      {STRENGTH_LABEL[strength]}
                    </span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                loading={loading}
                disabled={loading || (Object.keys(touched).length > 0 && hasErrors)}
                className="w-full mt-2"
              >
                Criar conta
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={onGoLogin}
                className="text-body-sm text-fg-on-dark-muted hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
              >
                Ja tem conta?{' '}
                <span className="text-brand-green font-medium">Entrar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
