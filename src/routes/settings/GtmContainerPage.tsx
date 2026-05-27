/**
 * GtmContainerPage — tela de gerenciamento do GTM Container per-tenant.
 *
 * Rota: /integracoes/gtm
 *
 * 3 estados:
 *  1. not_provisioned → mostra GtmProvisionForm (cria 2 containers)
 *  2. active → GtmStatusCard + Republish button (se isOutdated)
 *  3. failed → GtmStatusCard com erro + Re-tentar (limpa + provision novamente)
 */

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'
import { useTenant } from '@/hooks/useTenant'
import { useGtmContainer } from '@/hooks/useGtmContainer'
import { GtmStatusCard } from '@/components/gtm/GtmStatusCard'
import { GtmProvisionForm } from '@/components/gtm/GtmProvisionForm'

interface Props {
  onNavigate?: (href: string) => void
}

export function GtmContainerPage({ onNavigate }: Props) {
  const { toast } = useToast()
  const { tenant } = useTenant()
  const {
    info,
    currentMaster,
    isOutdated,
    loading,
    error,
    refresh,
    provision,
    republish,
  } = useGtmContainer()
  const [republishing, setRepublishing] = useState(false)

  async function handleRepublish() {
    setRepublishing(true)
    try {
      const r = await republish(true)
      if (r.status === 'already_current') {
        toast({
          title: 'Já está atualizado',
          description: `Tenant em ${r.to_version}, nada a fazer`,
          variant: 'info',
        })
      } else {
        const total =
          r.counts.web.tags.created +
          r.counts.web.variables.created +
          r.counts.server.tags.created
        toast({
          title: `Republished ${r.from_version} → ${r.to_version}`,
          description: `${total} entidades novas. ${r.warnings.length} warnings.`,
          variant: 'success',
        })
      }
    } catch (err) {
      toast({
        title: 'Falhou republish',
        description: err instanceof Error ? err.message : String(err),
        variant: 'danger',
      })
    } finally {
      setRepublishing(false)
    }
  }

  return (
    <AppShell activePath="/integracoes/gtm" onNavigate={onNavigate}>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header>
          <h1 className="text-h4 font-semibold text-fg-on-dark">
            GTM Container
          </h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-1">
            Google Tag Manager web + server provisionado e versionado a partir
            do master de Diego.
          </p>
        </header>

        {loading && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
            <div className="text-body-sm text-fg-on-dark-muted">
              Carregando status…
            </div>
          </div>
        )}

        {error && !loading && (
          <ErrorState message={`Erro ao carregar: ${error}`} onRetry={refresh} />
        )}

        {!loading && !error && (
          <>
            <GtmStatusCard
              info={info}
              currentMaster={currentMaster}
              isOutdated={isOutdated}
            />

            {info?.status === 'active' && isOutdated && (
              <div className="rounded-lg border border-warning/30 bg-warning/[0.05] p-4 flex items-center justify-between">
                <div>
                  <div className="text-body-sm font-medium text-fg-on-dark">
                    Master atualizado disponível
                  </div>
                  <div className="text-caption text-fg-on-dark-muted mt-0.5">
                    Tenant em {info.master_version?.version_name}, master atual
                    em {currentMaster?.version_name}
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={handleRepublish}
                  disabled={republishing}
                >
                  {republishing ? 'Sincronizando…' : 'Sincronizar agora'}
                </Button>
              </div>
            )}

            {(info?.status === 'not_provisioned' || !info) && tenant?.slug && (
              <GtmProvisionForm
                tenantSlug={tenant.slug}
                onProvision={async (payload) => {
                  await provision(payload)
                  refresh()
                }}
              />
            )}

            {info?.status === 'failed' && tenant?.slug && (
              <div className="rounded-lg border border-danger/30 bg-danger/[0.05] p-4">
                <div className="text-body-sm text-fg-on-dark mb-3">
                  Provisão falhou. Tente novamente:
                </div>
                <GtmProvisionForm
                  tenantSlug={tenant.slug}
                  onProvision={async (payload) => {
                    await provision(payload)
                    refresh()
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
