// Integrations — Grid 6 cards de plataforma + modal por plataforma
// Status persistido em localStorage (mock pre-backend).
// Reusa StatusBadge + Button + IntegrationModal.

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { IntegrationModal } from './IntegrationModal'
import { PLATFORM_META, PLATFORM_ORDER, type PlatformId } from './platforms'

type Status = 'not_configured' | 'configured_not_validated' | 'configured_validated' | 'error'

type CardState = {
  status: Status
  lastValidated: string | null
}

function loadState(): Record<PlatformId, CardState> {
  const result = {} as Record<PlatformId, CardState>
  for (const id of PLATFORM_ORDER) {
    const s = (localStorage.getItem(`mentoria-tracking.cred.${id}.status`) as Status | null) ?? 'not_configured'
    result[id] = {
      status: s,
      lastValidated: localStorage.getItem(`mentoria-tracking.cred.${id}.last_validated`),
    }
  }
  return result
}

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
    default: return 'Nao configurado'
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `ha ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `ha ${hours}h`
  return date.toLocaleDateString('pt-BR')
}

type Props = {
  onNavigate?: (href: string) => void
}

export function Integrations({ onNavigate }: Props) {
  const { toast } = useToast()
  const [state, setState] = useState<Record<PlatformId, CardState>>(() => loadState())
  const [openPlatform, setOpenPlatform] = useState<PlatformId | null>(null)
  const [testingId, setTestingId] = useState<PlatformId | null>(null)

  // Re-sync state quando modal fecha (refletir mudanca persistida)
  useEffect(() => {
    if (openPlatform === null) setState(loadState())
  }, [openPlatform])

  async function handleTest(id: PlatformId) {
    setTestingId(id)
    try {
      await new Promise((r) => setTimeout(r, 1500))
      const success = id.length % 3 !== 0
      const newStatus: Status = success ? 'configured_validated' : 'error'
      localStorage.setItem(`mentoria-tracking.cred.${id}.status`, newStatus)
      const now = new Date().toISOString()
      localStorage.setItem(`mentoria-tracking.cred.${id}.last_validated`, now)
      setState((s) => ({ ...s, [id]: { status: newStatus, lastValidated: now } }))
      if (success) {
        toast(`${PLATFORM_META[id].label}: conexao OK!`, 'success')
      } else {
        toast(`${PLATFORM_META[id].label}: erro na conexao. Verifique os tokens.`, 'error', 5000)
      }
    } finally {
      setTestingId(null)
    }
  }

  function handleSaved(id: PlatformId, status: 'configured_not_validated' | 'configured_validated') {
    setState((s) => ({ ...s, [id]: { status, lastValidated: new Date().toISOString() } }))
  }

  return (
    <AppShell activePath="/integracoes" onNavigate={onNavigate}>
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-h2 font-semibold text-fg-on-dark">Integracoes</h1>
          <p className="text-body-md text-fg-on-dark-muted mt-1">
            Conecte plataformas de ads, conversao e atendimento. Cole 3 tokens, veja ROAS amanha.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PLATFORM_ORDER.map((id) => {
            const meta = PLATFORM_META[id]
            const card = state[id]
            const configured =
              card.status === 'configured_validated' ||
              card.status === 'configured_not_validated'

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
                      <h3 id={`platform-${id}-title`} className="text-heading-sm font-semibold text-fg-on-dark truncate">
                        {meta.label}
                      </h3>
                      <p className="text-body-sm text-fg-on-dark-muted leading-snug">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={statusVariant(card.status)}>
                    {statusLabel(card.status)}
                  </StatusBadge>
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3 text-caption text-fg-on-dark-subtle">
                  <span>Ultima validacao: <span className="font-mono">{formatRelative(card.lastValidated)}</span></span>
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
                      disabled={testingId !== null}
                    >
                      Testar conexao
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
        onClose={() => setOpenPlatform(null)}
        onSaved={handleSaved}
      />
    </AppShell>
  )
}
