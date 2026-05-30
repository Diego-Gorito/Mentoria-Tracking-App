/**
 * MetaConnectStep — Step B do conector Meta Ads. Input password-style pro System
 * User token + botão Conectar. Trata erro de token inválido com mensagem amigável.
 */

import { useState } from 'react'
import { Eye, EyeSlash, ArrowLeft, ShieldCheck } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

interface Props {
  connecting: boolean
  error: string | null
  onConnect: (token: string) => void
  onBack: () => void
}

export function MetaConnectStep({ connecting, error, onConnect, onBack }: Props) {
  const [token, setToken] = useState('')
  const [reveal, setReveal] = useState(false)

  const canSubmit = token.trim().length >= 20 && !connecting

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onConnect(token)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-white/10 bg-white/[0.02] p-6 space-y-4"
    >
      <div>
        <h3 className="text-h6 font-semibold text-fg-on-dark">
          Cole seu token do Meta
        </h3>
        <p className="text-body-sm text-fg-on-dark-muted mt-1">
          Cole o System User token que você gerou no Business Manager. A gente valida
          na hora e lista suas contas de anúncios.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="meta-token" className="text-body-sm font-medium text-fg-on-dark-muted">
          System User Access Token
        </label>
        <div className="relative">
          <Input
            id="meta-token"
            type={reveal ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="EAAB... (token longo do Business Manager)"
            autoComplete="off"
            spellCheck={false}
            hasError={!!error}
            className="pr-10 font-mono"
            aria-describedby="meta-token-hint"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Ocultar token' : 'Mostrar token'}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-on-dark-muted hover:text-fg-on-dark p-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
          >
            {reveal ? <EyeSlash size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-caption text-red-400">
            {error}
          </p>
        ) : (
          <p
            id="meta-token-hint"
            className="flex items-center gap-1.5 text-caption text-fg-on-dark-subtle"
          >
            <ShieldCheck size={13} className="text-brand-green" aria-hidden="true" />
            Cifrado no nosso banco. Nunca mostramos o token de volta.
          </p>
        )}
      </div>

      <div className={cn('flex items-center justify-between pt-2')}>
        <Button type="button" variant="ghost" onClick={onBack} disabled={connecting}>
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar pro guia
        </Button>
        <Button type="submit" variant="primary" loading={connecting} disabled={!canSubmit}>
          Conectar
        </Button>
      </div>
    </form>
  )
}
