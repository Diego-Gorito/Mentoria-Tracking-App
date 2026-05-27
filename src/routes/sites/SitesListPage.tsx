// SitesListPage.tsx — F-S10 AC-1
// Rota /sites — empty (não conectado) ou lista de SiteCards (conectado).
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 1 (empty) + Tela 3 (lista).
//
// Estados renderizados (em ordem de prioridade):
//   1) Loading account → skeleton header
//   2) Sem account (isConnected=false) → EmptyState "Conecte sua Hostinger"
//   3) Loading sites → skeleton 3 cards
//   4) Erro sites → EmptyState variant=error + retry
//   5) Account OK + sites vazios → EmptyState "Nenhum site detectado"
//   6) Sites carregados → KPIs (conectados/instalados/drift) + lista SiteCard
//
// Composição apenas — sem lógica de install/revalidate (delegada via callbacks
// pra App.tsx navigate ou modais futuros em F-S10/F-S14 polish).

import { useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { KpiCard } from '@/components/ui/KpiCard'
import { SiteCard } from '@/components/sites/SiteCard'
import { useSites } from '@/hooks/useSites'
import { useHostingerAccount } from '@/hooks/useHostingerAccount'
import { GlobeHemisphereWest, ArrowsClockwise, Plugs } from '@phosphor-icons/react'
import type { BrandSlug, EnrichedSite } from '@/types/sites'

type Props = {
  onNavigate?: (href: string) => void
  /** Disparado quando user clica "Ver detalhes" em um card. */
  onViewSiteDetails?: (site: EnrichedSite) => void
  /** Disparado quando user clica "Instalar tracking" em um card. */
  onInstallSite?: (site: EnrichedSite, brand: BrandSlug) => void
  /**
   * Disparado quando user clica "Já ativei, validar agora" (status
   * uploaded_pending_activation) OU "Revalidar" (status installed) — Codex #4.
   * Container chama POST /api/installations/:id/revalidate.
   */
  onRevalidateSite?: (site: EnrichedSite) => void
}

function SiteCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-border-default bg-white p-5 flex flex-col gap-3 animate-pulse"
    >
      <div className="h-5 w-2/3 rounded bg-bg-muted" />
      <div className="h-3 w-1/2 rounded bg-bg-muted" />
      <div className="h-3 w-1/3 rounded bg-bg-muted" />
      <div className="flex justify-end gap-2 mt-2">
        <div className="h-9 w-24 rounded bg-bg-muted" />
        <div className="h-9 w-24 rounded bg-bg-muted" />
      </div>
    </div>
  )
}

export function SitesListPage({
  onNavigate,
  onViewSiteDetails,
  onInstallSite,
  onRevalidateSite,
}: Props) {
  const { account, isConnected } = useHostingerAccount()
  const { sites, isLoading, error, refresh } = useSites()

  // KPIs derivados (UX §3 Tela 3 header opcional).
  const kpis = useMemo(() => {
    const connected = sites.length
    const installed = sites.filter((s) => s.status === 'installed').length
    const drift = sites.filter((s) => s.status === 'drift_detected').length
    return { connected, installed, drift }
  }, [sites])

  // CASO 1 — sem account: empty state + CTA principal Conectar.
  // (Não mostramos lista vazia/loading antes de account estar resolvido pra evitar
  // flash de cards quando user ainda não conectou nada.)
  if (!isConnected && !account) {
    return (
      <AppShell activePath="/sites" onNavigate={onNavigate}>
        <header className="mb-6">
          <h1 className="text-h2 font-semibold text-fg-on-dark">Sites Conectados</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
            Conecte sua conta Hostinger pra detectar e instalar tracking em sites WordPress.
          </p>
        </header>

        <div
          className="rounded-xl border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          <EmptyState
            icon={GlobeHemisphereWest}
            title="Conecte sua Hostinger pra começar"
            description="Vamos detectar seus sites WordPress automaticamente e instalar GTM em poucos cliques. Tudo sem você precisar logar no painel."
            action={{
              label: 'Conectar via Hostinger',
              onClick: () => onNavigate?.('sites/connect'),
              icon: Plugs,
            }}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell activePath="/sites" onNavigate={onNavigate}>
      {/* Page header: título + ações secundárias. */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-h2 font-semibold text-fg-on-dark">Sites Conectados</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
            Sites WordPress detectados na sua conta Hostinger
            {account?.account_label && (
              <> (<span className="font-mono">{account.account_label}</span>)</>
            )}
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={isLoading}
            aria-label="Atualizar lista de sites"
          >
            <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate?.('sites/connect')}
          >
            <Plugs size={14} weight="bold" aria-hidden="true" />
            Conectar conta
          </Button>
        </div>
      </div>

      {/* KPIs — só renderiza quando temos sites válidos (não loading/erro). */}
      {!isLoading && !error && sites.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="Sites conectados"
            value={String(kpis.connected)}
            icon={GlobeHemisphereWest}
          />
          <KpiCard label="Tracking instalado" value={String(kpis.installed)} />
          <KpiCard label="Drift detectado" value={String(kpis.drift)} positiveIsGood={false} />
        </div>
      )}

      {/* Lista — skeleton / erro / vazio / cards. */}
      <section aria-label="Lista de sites">
        {isLoading && (
          <div className="grid grid-cols-1 gap-4" role="status" aria-live="polite">
            <span className="sr-only">Carregando sites…</span>
            <SiteCardSkeleton />
            <SiteCardSkeleton />
            <SiteCardSkeleton />
          </div>
        )}

        {!isLoading && error && (
          <div
            className="rounded-xl border"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <ErrorState
              message={`Falha ao carregar sites: ${error.message}`}
              onRetry={() => void refresh()}
            />
          </div>
        )}

        {!isLoading && !error && sites.length === 0 && (
          <div
            className="rounded-xl border"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <EmptyState
              icon={GlobeHemisphereWest}
              title="Nenhum site detectado ainda"
              description="Sua conta Hostinger não tem sites visíveis pra essa API key. Verifique no hPanel ou conecte outra conta."
              action={{
                label: 'Atualizar lista',
                onClick: () => void refresh(),
                icon: ArrowsClockwise,
              }}
            />
          </div>
        )}

        {!isLoading && !error && sites.length > 0 && (
          <ul className="flex flex-col gap-4 list-none">
            {sites.map((site) => (
              <li key={site.domain}>
                <SiteCard
                  site={site}
                  onInstall={onInstallSite}
                  onRevalidate={onRevalidateSite}
                  onViewDetails={onViewSiteDetails}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
