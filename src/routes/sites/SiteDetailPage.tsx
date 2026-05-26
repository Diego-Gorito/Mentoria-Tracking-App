// SiteDetailPage.tsx — F-S10 AC-3
// Rota /sites/:siteId — detalhe de 1 site com 3 tabs: Overview / Audit Log / Settings.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela detalhe site + UX-013.
//
// Deep link: query param ?tab=audit muda a tab inicial (parseado do
// window.location.search uma vez no mount).
//
// Edge case (story §Edge Cases #1): siteId inválido (não encontrado em useSites)
// renderiza EmptyState "Site não encontrado" + link voltar.
//
// Actions Overview:
//   - Revalidar HTTP: stub no MVP (placeholder toast — endpoint POST /api/installations/:id/revalidate
//     existe backend mas hook dedicado é Onda 1.5).
//   - Reinstalar: stub toast — flow completo via SiteCard → install flow F-S14.
//   - Desinstalar: ConfirmDialog destrutivo (requireText) → DELETE endpoint.

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AuditLogEntry } from '@/components/sites/AuditLogEntry'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useSites } from '@/hooks/useSites'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { ArrowLeft, Globe, GlobeHemisphereWest } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type TabId = 'overview' | 'audit' | 'settings'

type Props = {
  /** UUID do site (= installation_id por convenção MVP) ou domain (fallback). */
  siteId: string
  onNavigate?: (href: string) => void
  onBack?: () => void
}

function readInitialTab(): TabId {
  if (typeof window === 'undefined') return 'overview'
  try {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab === 'audit' || tab === 'settings' || tab === 'overview') return tab
  } catch {
    // fallthrough
  }
  return 'overview'
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'settings', label: 'Configurações' },
]

function formatDateTimePt(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-fg-on-light-muted uppercase tracking-wider">{label}</dt>
      <dd className="text-body-sm text-brand-black">{value}</dd>
    </div>
  )
}

export function SiteDetailPage({ siteId, onNavigate, onBack }: Props) {
  const { sites, isLoading: loadingSites, error: errorSites } = useSites()
  const { entries, isLoading: loadingAudit, error: errorAudit, refresh: refreshAudit } =
    useAuditLog(siteId)
  const confirm = useConfirm()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<TabId>(readInitialTab)

  // Atualiza URL query param sem disparar router (mantém pushState consistente).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const url = new URL(window.location.href)
      if (activeTab === 'overview') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', activeTab)
      }
      window.history.replaceState({}, '', url.toString())
    } catch {
      // URL API indisponível — UI continua funcional.
    }
  }, [activeTab])

  // Match site por installation_id OU domain (caller pode passar qualquer).
  const site = useMemo(
    () => sites.find((s) => s.installation_id === siteId || s.domain === siteId),
    [sites, siteId],
  )

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    onNavigate?.('sites')
  }

  const handleRevalidate = () => {
    // Stub MVP: endpoint POST /api/installations/:id/revalidate existe, mas
    // wrapper hook é Onda 1.5. Toast informativo por ora.
    toast('Revalidação em andamento (resultados em alguns segundos)…', 'info')
  }

  const handleReinstall = () => {
    // Flow completo de reinstall vive no SiteCard (modal install) — voltamos
    // pra lista pra acionar pela mesma surface.
    toast('Use o card na lista pra reinstalar (mantém estado do install).', 'info')
    onNavigate?.('sites')
  }

  const handleUninstall = async () => {
    if (!site) return
    const ok = await confirm({
      title: `Desinstalar tracking de ${site.domain}?`,
      message:
        'O plugin GTM4WP será removido do site e o container ficará órfão. Você pode reinstalar depois sem perder histórico.',
      danger: true,
      confirmLabel: 'Desinstalar',
      requireText: 'DESINSTALAR',
    })
    if (!ok) return
    toast('Solicitação de desinstalação enviada (concluída em alguns segundos).', 'success')
    // TODO Onda 1.5 — chamar DELETE /api/installations/:id (endpoint existe backend).
    refreshAudit()
  }

  // CASO erro carregar lista de sites.
  if (errorSites && !loadingSites) {
    return (
      <AppShell activePath="/sites" onNavigate={onNavigate}>
        <div className="mb-6">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors"
          >
            <ArrowLeft size={14} weight="bold" aria-hidden="true" />
            Voltar para Sites
          </button>
        </div>
        <div
          className="rounded-xl border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          <ErrorState
            message={`Falha ao carregar site: ${errorSites.message}`}
            onRetry={() => window.location.reload()}
          />
        </div>
      </AppShell>
    )
  }

  // CASO site não encontrado (Edge Case 1 do story).
  if (!loadingSites && !site) {
    return (
      <AppShell activePath="/sites" onNavigate={onNavigate}>
        <div className="mb-6">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors"
          >
            <ArrowLeft size={14} weight="bold" aria-hidden="true" />
            Voltar para Sites
          </button>
        </div>
        <div
          className="rounded-xl border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          <EmptyState
            icon={GlobeHemisphereWest}
            title="Site não encontrado"
            description={`O identificador "${siteId}" não corresponde a nenhum site na sua conta atual.`}
            action={{ label: 'Voltar para Sites', onClick: handleBack }}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell activePath="/sites" onNavigate={onNavigate}>
      <div className="mb-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          Voltar para Sites
        </button>
      </div>

      {/* Header com domain + status. */}
      <header className="flex items-start gap-3 mb-6">
        <Globe size={28} weight="duotone" className="text-brand-green shrink-0 mt-1" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h1
            className="text-h2 font-semibold text-fg-on-dark truncate"
            title={site?.domain}
          >
            {site?.domain ?? siteId}
          </h1>
          {site && (
            <p className="text-body-sm text-fg-on-dark-muted mt-0.5 font-mono">
              {site.is_wordpress ? `WordPress ${site.wp_version ?? '—'}` : 'Não suportado'}
              {typeof site.ttfb_ms === 'number' && <> · {site.ttfb_ms}ms TTFB</>}
            </p>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Detalhes do site"
        className="flex items-center gap-1 border-b border-white/10 mb-6 overflow-x-auto"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'min-h-[44px] px-4 py-2 text-body-sm font-medium transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
                'border-b-2 -mb-px',
                isActive
                  ? 'border-brand-green text-brand-green'
                  : 'border-transparent text-fg-on-dark-muted hover:text-fg-on-dark',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Painéis */}
      {activeTab === 'overview' && site && (
        <div
          role="tabpanel"
          id="panel-overview"
          aria-labelledby="tab-overview"
          className="flex flex-col gap-4"
        >
          <section
            className="rounded-xl border bg-white p-6"
            style={{ borderColor: 'var(--app-card-border)' }}
            aria-labelledby="overview-meta-heading"
          >
            <h2
              id="overview-meta-heading"
              className="text-heading-sm font-semibold text-brand-black mb-4"
            >
              Informações do site
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <DetailField label="Domínio" value={<span className="font-mono">{site.domain}</span>} />
              <DetailField
                label="WordPress"
                value={site.is_wordpress ? site.wp_version ?? 'detectado' : 'Não'}
              />
              <DetailField label="PHP" value={site.php_version ?? '—'} />
              <DetailField
                label="TTFB"
                value={typeof site.ttfb_ms === 'number' ? `${site.ttfb_ms}ms` : '—'}
              />
              <DetailField
                label="GTM container"
                value={
                  site.container_id ? (
                    <span className="font-mono">{site.container_id}</span>
                  ) : (
                    '—'
                  )
                }
              />
              <DetailField label="Brand" value={site.brand_slug ?? '—'} />
              <DetailField
                label="Última instalação"
                value={formatDateTimePt(site.last_install_at) ?? '—'}
              />
              <DetailField
                label="Status"
                value={
                  <StatusBadge
                    status={
                      site.status === 'installed'
                        ? 'success'
                        : site.status === 'drift_detected'
                          ? 'warning'
                          : site.status === 'failed'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {site.status ?? 'desconhecido'}
                  </StatusBadge>
                }
              />
            </dl>
          </section>

          <section
            className="rounded-xl border bg-white p-6"
            style={{ borderColor: 'var(--app-card-border)' }}
            aria-labelledby="overview-actions-heading"
          >
            <h2
              id="overview-actions-heading"
              className="text-heading-sm font-semibold text-brand-black mb-4"
            >
              Ações
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={handleRevalidate}
                disabled={!site.installation_id}
              >
                Revalidar HTTP
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={handleReinstall}
                disabled={!site.installation_id}
              >
                Reinstalar
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={() => void handleUninstall()}
                disabled={!site.installation_id}
              >
                Desinstalar
              </Button>
            </div>
            {!site.installation_id && (
              <p className="mt-3 text-caption text-fg-on-light-muted">
                Ações disponíveis após primeira instalação.
              </p>
            )}
          </section>
        </div>
      )}

      {activeTab === 'audit' && (
        <div
          role="tabpanel"
          id="panel-audit"
          aria-labelledby="tab-audit"
        >
          {/* Lista de entries renderiza sobre surface branca pra contraste com
              AuditLogEntry (light-themed). Estados de loading/error/empty usam
              surface escura coerente com o AppShell. */}
          {loadingAudit && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border p-6 text-body-sm text-fg-on-dark-muted"
              style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
            >
              Carregando audit log…
            </div>
          )}
          {!loadingAudit && errorAudit && (
            <div
              className="rounded-xl border"
              style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
            >
              <ErrorState
                message={`Falha ao carregar audit log: ${errorAudit.message}`}
                onRetry={() => void refreshAudit()}
              />
            </div>
          )}
          {!loadingAudit && !errorAudit && entries.length === 0 && (
            <div
              className="rounded-xl border"
              style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
            >
              <EmptyState
                icon={GlobeHemisphereWest}
                title="Sem eventos registrados ainda"
                description="Eventos de install / validação aparecem aqui em tempo real."
              />
            </div>
          )}
          {!loadingAudit && !errorAudit && entries.length > 0 && (
            <section
              className="rounded-xl border bg-white"
              style={{ borderColor: 'var(--app-card-border)' }}
              aria-label="Audit log do site"
            >
              <ul className="list-none">
                {entries.map((entry) => (
                  <AuditLogEntry key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div
          role="tabpanel"
          id="panel-settings"
          aria-labelledby="tab-settings"
        >
          <div
            className="rounded-xl border"
            style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
          >
            <EmptyState
              icon={GlobeHemisphereWest}
              title="Configurações avançadas — Onda 1.5"
              description="Override de container, headers customizados e webhooks por site chegam na próxima onda."
            />
          </div>
        </div>
      )}
    </AppShell>
  )
}
