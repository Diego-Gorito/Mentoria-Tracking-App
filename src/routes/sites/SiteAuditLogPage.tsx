// SiteAuditLogPage.tsx — F-S10 AC-4
// Rota /sites/:siteId/logs — full-page audit log (bookmarkable per UX-013).
// Diferente de SiteDetailPage tab "audit": aqui o foco é log puro, em fullpage,
// com breadcrumb "Sites / [domain] / Logs" e espaço pra filtros futuros.
//
// MVP: top 50 entries (limite imposto pelo hook), filtros action-type + date
// range são placeholder Onda 1.5 (story §AC-4).

import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Button } from '@/components/ui/Button'
import { AuditLogEntry } from '@/components/sites/AuditLogEntry'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useSites } from '@/hooks/useSites'
import { ArrowLeft, ArrowsClockwise, GlobeHemisphereWest } from '@phosphor-icons/react'

type Props = {
  siteId: string
  onNavigate?: (href: string) => void
  onBack?: () => void
}

export function SiteAuditLogPage({ siteId, onNavigate, onBack }: Props) {
  const { sites } = useSites()
  const { entries, isLoading, error, refresh } = useAuditLog(siteId)

  const site = sites.find((s) => s.installation_id === siteId || s.domain === siteId)
  const domainLabel = site?.domain ?? siteId

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    onNavigate?.(`sites/${siteId}`)
  }

  return (
    <AppShell activePath="/sites" onNavigate={onNavigate}>
      {/* Breadcrumb estilo nav */}
      <nav aria-label="Trilha de navegação" className="mb-4">
        <ol className="flex items-center gap-1.5 text-body-sm text-fg-on-dark-muted flex-wrap">
          <li>
            <button
              type="button"
              onClick={() => onNavigate?.('sites')}
              className="hover:text-brand-green transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              Sites
            </button>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <button
              type="button"
              onClick={() => onNavigate?.(`sites/${siteId}`)}
              className="hover:text-brand-green transition-colors font-mono truncate max-w-[300px] inline-block align-middle rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              title={domainLabel}
            >
              {domainLabel}
            </button>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg-on-dark font-medium">
            Logs
          </li>
        </ol>
      </nav>

      <div className="mb-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-body-sm text-fg-on-dark-muted hover:text-brand-green transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          Voltar para detalhes do site
        </button>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-h2 font-semibold text-fg-on-dark truncate">
            Audit log
          </h1>
          <p
            className="text-body-sm text-fg-on-dark-muted mt-0.5 font-mono truncate"
            title={domainLabel}
          >
            {domainLabel}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
          disabled={isLoading}
          aria-label="Atualizar audit log"
        >
          <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
          Atualizar
        </Button>
      </div>

      {/* Filtros placeholder — Onda 1.5 (story §AC-4) */}
      <div
        aria-hidden="true"
        className="mb-4 text-caption text-fg-on-dark-subtle italic"
      >
        Filtros por tipo de ação e intervalo de datas chegam na Onda 1.5.
      </div>

      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border p-6 text-body-sm text-fg-on-dark-muted"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          Carregando audit log…
        </div>
      )}

      {!isLoading && error && (
        <div
          className="rounded-xl border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          <ErrorState
            message={`Falha ao carregar audit log: ${error.message}`}
            onRetry={() => void refresh()}
          />
        </div>
      )}

      {!isLoading && !error && entries.length === 0 && (
        <div
          className="rounded-xl border"
          style={{ background: 'var(--app-card-bg)', borderColor: 'var(--app-card-border)' }}
        >
          <EmptyState
            icon={GlobeHemisphereWest}
            title="Sem eventos registrados ainda"
            description="Eventos de install / validação aparecem aqui em tempo real conforme acontecem."
          />
        </div>
      )}

      {!isLoading && !error && entries.length > 0 && (
        <section
          aria-label="Lista de eventos do audit log"
          className="rounded-xl border bg-white"
          style={{ borderColor: 'var(--app-card-border)' }}
        >
          <ul className="list-none">
            {entries.map((entry) => (
              <AuditLogEntry key={entry.id} entry={entry} />
            ))}
          </ul>
          <div
            className="px-4 py-3 border-t text-caption text-fg-on-light-muted"
            style={{ borderColor: 'var(--app-card-border)' }}
          >
            Mostrando {entries.length} {entries.length === 1 ? 'evento' : 'eventos'} (máx 50).
          </div>
        </section>
      )}
    </AppShell>
  )
}
