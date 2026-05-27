// Integrations — Grid 6 cards de plataforma + modal por plataforma.
// Status persistido via /api/credentials/:tenantId (backend real).
// Fallback gracioso: se backend indisponível, mostra status 'not_configured' com erro.

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ErrorState } from '@/components/ui/ErrorState'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { IntegrationModal } from './IntegrationModal'
import { PLATFORM_META, PLATFORM_ORDER, type PlatformId } from './platforms'
import { useCredentials } from '@/hooks/useCredentials'
import { useTenant } from '@/hooks/useTenant'
import { credentialsApi } from '@/lib/api'

type Status = 'not_configured' | 'configured_not_validated' | 'configured_validated' | 'error'

function statusVariant(s: Status): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (s) {
    case 'configured_validated': return 'success'
    case 'configured_not_validated': return 'warning'
    case 'error': return 'danger'
    default: return 'neutral'
  }
}

function statusLabel(s: Status): string {
  switch (s) {
    case 'configured_validated': return 'Validado'
    case 'configured_not_validated': return 'Configurado'
    case 'error': return 'Erro'
    default: return 'Não configurado'
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  return date.toLocaleDateString('pt-BR')
}

type Props = {
  onNavigate?: (href: string) => void
}

export function Integrations({ onNavigate }: Props) {
  const { toast } = useToast()
  const { tenant } = useTenant()
  const { credentials, loading: credsLoading, error: credsError, refresh } = useCredentials()
  const [openPlatform, setOpenPlatform] = useState<PlatformId | null>(null)
  const [testingId, setTestingId] = useState<PlatformId | null>(null)

  // Helpers para acessar status de uma plataforma
  function credFor(id: PlatformId) {
    return credentials.find((c) => c.providerId === id)
  }

  function getStatus(id: PlatformId): Status {
    return credFor(id)?.status ?? 'not_configured'
  }

  function getLastValidated(id: PlatformId): string | null {
    return credFor(id)?.lastValidatedAt ?? null
  }

  async function handleTest(id: PlatformId) {
    if (!tenant?.tenantId) {
      toast('Tenant não identificado. Faça login novamente.', 'error')
      return
    }
    setTestingId(id)
    try {
      const result = await credentialsApi.testConnection(id, tenant.tenantId)
      if (result.ok) {
        toast(`${PLATFORM_META[id].label}: conexão OK!`, 'success')
      } else {
        toast(
          `${PLATFORM_META[id].label}: ${result.message ?? 'erro na conexão. Verifique os tokens.'}`,
          'error',
          5000,
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao testar conexão'
      toast(`${PLATFORM_META[id].label}: ${msg}`, 'error', 5000)
    } finally {
      setTestingId(null)
      // Refresh status após teste (backend pode ter atualizado)
      refresh()
    }
  }

  function handleSaved(_id: PlatformId, _status: 'configured_not_validated' | 'configured_validated') {
    // Refresh credenciais do backend após salvar no modal
    refresh()
  }

  return (
    <AppShell activePath="/integracoes" onNavigate={onNavigate}>
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-h2 font-semibold text-fg-on-dark">Integrações</h1>
          <p className="text-body-md text-fg-on-dark-muted mt-1">
            Conecte plataformas de ads, conversão e atendimento. Cole 3 tokens, veja ROAS amanhã.
          </p>
        </div>

        {/* Erro ao carregar credenciais — não bloqueia UI, só alerta */}
        {credsError && (
          <div
            className="rounded-xl border mb-4"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <ErrorState
              message={`Não foi possível carregar status das integrações: ${credsError}`}
              onRetry={refresh}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PLATFORM_ORDER.map((id) => {
            const meta = PLATFORM_META[id]
            const status = getStatus(id)
            const lastValidated = getLastValidated(id)
            const configured =
              status === 'configured_validated' || status === 'configured_not_validated'

            return (
              <article
                key={id}
                aria-labelledby={`platform-${id}-title`}
                className="rounded-xl border p-5 flex flex-col gap-4"
                style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0" aria-hidden="true">{meta.emoji}</span>
                    <div className="min-w-0">
                      <h3
                        id={`platform-${id}-title`}
                        className="text-heading-sm font-semibold text-fg-on-dark truncate"
                      >
                        {meta.label}
                      </h3>
                      <p className="text-body-sm text-fg-on-dark-muted leading-snug">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  {/* Skeleton de status enquanto carrega */}
                  {credsLoading ? (
                    <div className="h-5 w-20 rounded-full bg-white/[0.06] animate-pulse" />
                  ) : (
                    <StatusBadge status={statusVariant(status)}>
                      {statusLabel(status)}
                    </StatusBadge>
                  )}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3 text-caption text-fg-on-dark-subtle">
                  <span>
                    Última validação:{' '}
                    <span className="font-mono">{formatRelative(lastValidated)}</span>
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-auto">
                  <Button
                    variant={configured ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => setOpenPlatform(id)}
                  >
                    {configured ? 'Editar' : 'Configurar'}
                  </Button>
                  {configured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(id)}
                      loading={testingId === id}
                      disabled={testingId !== null || credsLoading}
                    >
                      Testar conexão
                    </Button>
                  )}
                  <a
                    href={meta.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-caption text-fg-on-dark-subtle hover:text-brand-green transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
                  >
                    Docs ↗
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <IntegrationModal
        platformId={openPlatform}
        onClose={() => {
          setOpenPlatform(null)
          refresh()
        }}
        onSaved={handleSaved}
      />
    </AppShell>
  )
}
