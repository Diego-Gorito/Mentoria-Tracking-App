// ConnectHostingerPage.tsx — F-S10 AC-2
// Rota /sites/connect — form dedicado (NÃO modal, per UX-002) pra colar token
// Hostinger + apelido opcional + senha WP admin (opcional MVP).
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 2.
//
// Flow:
//   1) HostingerHelpAccordion aberto (defaultOpen=true) na primeira visita.
//   2) User cola token → TokenInput valida shape mínimo (não-vazio + ≥10 chars).
//   3) Submit chama useHostingerAccount().connect() → toast success/error.
//   4) Sucesso → navigate '/sites'. Erro → toast + mantém form intacto.
//
// A11y: form com <form onSubmit>, label/htmlFor amarrados, error em role=alert,
// botão submit com loading state explícito.

import { useState, type FormEvent } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { HostingerHelpAccordion } from '@/components/sites/HostingerHelpAccordion'
import { TokenInput } from '@/components/sites/TokenInput'
import { useHostingerAccount } from '@/hooks/useHostingerAccount'
import { ArrowLeft, Plugs } from '@phosphor-icons/react'

type Props = {
  onNavigate?: (href: string) => void
  /** Disparado ao cancelar (back). */
  onCancel?: () => void
}

const MIN_TOKEN_LENGTH = 10

export function ConnectHostingerPage({ onNavigate, onCancel }: Props) {
  const { connect, isConnecting } = useHostingerAccount()
  const { toast } = useToast()

  const [token, setToken] = useState('')
  const [label, setLabel] = useState('')
  const [wpAdminPass, setWpAdminPass] = useState('')
  const [tokenError, setTokenError] = useState<string | null>(null)

  const handleBack = () => {
    if (onCancel) {
      onCancel()
      return
    }
    onNavigate?.('sites')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTokenError(null)

    const trimmed = token.trim()
    if (trimmed.length === 0) {
      setTokenError('Cole seu token Hostinger pra continuar.')
      return
    }
    if (trimmed.length < MIN_TOKEN_LENGTH) {
      setTokenError(`Token parece curto demais (mínimo ${MIN_TOKEN_LENGTH} caracteres).`)
      return
    }

    try {
      await connect(
        trimmed,
        label.trim() || undefined,
        wpAdminPass.trim() || undefined,
      )
      toast('Conta Hostinger conectada com sucesso.', 'success')
      onNavigate?.('sites')
    } catch (err) {
      // useHostingerAccount.connect() já traduz o erro pra PT-BR via translateApiError.
      const message = err instanceof Error ? err.message : 'Falha ao conectar conta.'
      toast(message, 'error')
      // Mantém form intacto — user pode corrigir token e tentar de novo.
    }
  }

  return (
    <AppShell activePath="/sites" onNavigate={onNavigate}>
      {/* Breadcrumb / voltar */}
      <div className="mb-6">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          Voltar para Sites
        </button>
      </div>

      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-h2 font-semibold text-fg-on-dark">Conectar Hostinger</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-1.5">
            Vamos detectar seus sites WordPress automaticamente e instalar GTM em poucos cliques.
            Seu token é criptografado antes de salvar (Supabase Vault).
          </p>
        </header>

        <div className="mb-6">
          <HostingerHelpAccordion defaultOpen={true} />
        </div>

        {/* Form em surface clara (TokenInput/Accordion já são light-theme).
            Container envolve numa surface dark coerente do AppShell — o card
            interno usa text-fg-on-light pra contrast. */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-xl border bg-white p-6 flex flex-col gap-5"
          style={{ borderColor: 'var(--app-card-border)' }}
          aria-labelledby="connect-form-heading"
        >
          <h2 id="connect-form-heading" className="sr-only">
            Dados de conexão Hostinger
          </h2>

          {/* Apelido — texto livre em surface clara via Input nativo, não Field
              (Field assume dark theme). Mantemos consistência usando classes diretas. */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="hostinger-account-label"
              className="text-body-sm font-medium text-fg-on-light"
            >
              Apelido (opcional)
            </label>
            <input
              id="hostinger-account-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={isConnecting}
              placeholder="Ex: Conta Pessoal"
              maxLength={80}
              className="w-full min-h-[44px] h-11 px-3 rounded-md border border-border-default bg-white text-body-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green disabled:bg-bg-muted disabled:cursor-not-allowed transition-colors"
            />
            <p className="text-caption text-fg-on-light-muted">
              Identifica essa conta na lista (útil se você gerencia múltiplas).
            </p>
          </div>

          <TokenInput
            value={token}
            onChange={(value) => {
              setToken(value)
              if (tokenError) setTokenError(null)
            }}
            error={tokenError ?? undefined}
            disabled={isConnecting}
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="wp-admin-password"
              className="text-body-sm font-medium text-fg-on-light"
            >
              Senha admin WordPress (opcional)
            </label>
            <input
              id="wp-admin-password"
              type="password"
              value={wpAdminPass}
              onChange={(event) => setWpAdminPass(event.target.value)}
              disabled={isConnecting}
              autoComplete="off"
              spellCheck={false}
              className="w-full min-h-[44px] h-11 px-3 rounded-md border border-border-default bg-white text-body-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green disabled:bg-bg-muted disabled:cursor-not-allowed transition-colors"
            />
            <p className="text-caption text-fg-on-light-muted">
              Necessária pra ativar o plugin GTM4WP via wp-admin REST. Você pode
              pular agora e fornecer site-a-site depois.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleBack}
              disabled={isConnecting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isConnecting}
              disabled={isConnecting}
            >
              <Plugs size={14} weight="bold" aria-hidden="true" />
              Validar e conectar
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
