// SiteCard.tsx — F-S09 AC-1
// Card de 1 site (lista /sites). Responsive: desktop horizontal, mobile (≤640px) stack vertical.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 3.
// A11y: <article aria-labelledby="...-domain">, status com aria-label textual (UX-009).

import { useMemo, type ReactNode } from 'react'
import { Globe, Warning, Prohibit, DotsThree, Clock } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { BrandSelect } from './BrandSelect'
import type { BrandSlug, EnrichedSite, SiteStatus } from '@/types/sites'

type Props = {
  site: EnrichedSite
  /** Trigger pra novo install (button "Instalar tracking"). */
  onInstall?: (site: EnrichedSite, brand: BrandSlug) => void
  /** Trigger revalidação (HTTP check). */
  onRevalidate?: (site: EnrichedSite) => void
  /** Trigger reinstall (override) — confirmDialog upstream. */
  onReinstall?: (site: EnrichedSite) => void
  /** Trigger ver detalhes / audit log. */
  onViewDetails?: (site: EnrichedSite) => void
  /** Brand change handler (props passed to BrandSelect). */
  onBrandChange?: (site: EnrichedSite, brand: BrandSlug) => void
  className?: string
}

type BadgeKind = {
  status: 'success' | 'info' | 'warning' | 'danger' | 'neutral'
  label: string
  ariaLabel: string
  icon: ReactNode
}

function badgeFor(status: SiteStatus | undefined, isWordPress: boolean): BadgeKind {
  // UX §4.2 status labels.
  if (!isWordPress) {
    return {
      status: 'neutral',
      label: 'Não suportado',
      ariaLabel: 'Status: não suportado',
      icon: <Prohibit size={14} weight="bold" aria-hidden="true" />,
    }
  }
  switch (status) {
    case 'installed':
      return {
        status: 'success',
        label: 'Instalado',
        ariaLabel: 'Status: instalado',
        icon: null,
      }
    case 'drift_detected':
      return {
        status: 'warning',
        label: 'Drift detectado',
        ariaLabel: 'Status: drift detectado',
        icon: <Warning size={14} weight="bold" aria-hidden="true" />,
      }
    case 'failed':
      return {
        status: 'danger',
        label: 'Falha na instalação',
        ariaLabel: 'Status: falha na instalação',
        icon: null,
      }
    case 'draft':
      return {
        status: 'info',
        label: 'Instalando…',
        ariaLabel: 'Status: instalando',
        icon: null,
      }
    case 'uploaded_pending_activation':
      // Codex #4 (2026-05-27): estado terminal do deploy MVP. Plugin no
      // servidor, aguarda user ativar no wp-admin antes do validator F-S06.
      return {
        status: 'warning',
        label: 'Aguardando ativação',
        ariaLabel: 'Status: aguardando ativação no wp-admin',
        icon: <Clock size={14} weight="bold" aria-hidden="true" />,
      }
    case 'not_installed':
    default:
      return {
        status: 'neutral',
        label: 'Não instalado',
        ariaLabel: 'Status: não instalado',
        icon: null,
      }
  }
}

// Truncate >40 chars com ellipsis (Edge Case 1). Tooltip via title=full.
function truncDomain(d: string): string {
  return d.length > 40 ? `${d.slice(0, 37)}…` : d
}

function formatLastInstall(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)
  if (diffMin < 1) return 'agora há pouco'
  if (diffMin < 60) return `há ${diffMin}min`
  if (diffH < 24) return `há ${diffH}h`
  if (diffD < 7) return `há ${diffD}d`
  return d.toLocaleDateString('pt-BR')
}

export function SiteCard({
  site,
  onInstall,
  onRevalidate,
  onReinstall,
  onViewDetails,
  onBrandChange,
  className,
}: Props) {
  const badge = useMemo(() => badgeFor(site.status, site.is_wordpress), [site.status, site.is_wordpress])
  const status = site.status ?? 'not_installed'
  const isInstalled = status === 'installed' || status === 'drift_detected'
  const isInstalling = status === 'draft'
  const isFailed = status === 'failed'
  const isPendingActivation = status === 'uploaded_pending_activation'
  const isUnsupported = !site.is_wordpress
  const lastInstall = formatLastInstall(site.last_install_at)

  // ID pra aria-labelledby
  const domainId = `site-card-${site.domain.replace(/[^\w]/g, '-')}-domain`

  return (
    <article
      aria-labelledby={domainId}
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border-default bg-white p-5 shadow-xs',
        'sm:flex-row sm:items-start sm:gap-6',
        'hover:border-zinc-300 transition-colors',
        className,
      )}
    >
      {/* Header + metadata column */}
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <Globe
            size={18}
            weight="duotone"
            className="text-fg-on-light-muted shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <h3
            id={domainId}
            title={site.domain}
            className="text-body-md font-semibold text-brand-black truncate"
          >
            {truncDomain(site.domain)}
          </h3>
        </div>

        <p className="text-caption font-mono text-fg-on-light-muted tabular-nums">
          {site.is_wordpress ? (
            <>
              {site.wp_version && <>WordPress {site.wp_version}</>}
              {site.php_version && <> · PHP {site.php_version}</>}
              {typeof site.ttfb_ms === 'number' && <> · {site.ttfb_ms}ms</>}
            </>
          ) : (
            'WordPress não detectado'
          )}
        </p>

        {isInstalled && site.container_id && (
          <p className="text-caption font-mono text-fg-on-light-muted">
            Container: <span className="text-brand-black">{site.container_id}</span>
          </p>
        )}

        {lastInstall && (
          <p className="text-caption text-fg-on-light-muted">Última instalação: {lastInstall}</p>
        )}
      </div>

      {/* Controls column */}
      <div className="flex flex-col gap-3 sm:items-end sm:min-w-[240px]">
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span aria-label={badge.ariaLabel}>
            <StatusBadge status={badge.status} className="inline-flex items-center gap-1">
              {badge.icon}
              {badge.label}
            </StatusBadge>
          </span>
        </div>

        {!isUnsupported && (
          <BrandSelect
            value={site.brand_slug}
            disabled={isInstalled || isInstalling || isPendingActivation}
            onChange={(slug) => onBrandChange?.(site, slug)}
            label={`Brand do site ${site.domain}`}
            className="w-full sm:w-auto sm:min-w-[200px]"
          />
        )}

        <div className="flex flex-wrap items-center gap-2 sm:justify-end w-full">
          {/* Actions per UX §3 Tela 3 estados. */}
          {!isUnsupported && status === 'not_installed' && onInstall && (
            <Button
              variant="primary"
              size="md"
              disabled={!site.brand_slug}
              onClick={() => site.brand_slug && onInstall(site, site.brand_slug)}
              className="min-h-[44px]"
            >
              Instalar tracking
            </Button>
          )}

          {/* Codex #4 (2026-05-27): estado pending_activation — plugin no
              servidor mas user precisa ativar no wp-admin antes do validator
              F-S06 confirmar. CTA primária "Já ativei, validar agora" dispara
              POST /:id/revalidate via onRevalidate. */}
          {!isUnsupported && isPendingActivation && (
            <>
              <p className="text-caption text-fg-on-light-muted text-right sm:max-w-[260px]">
                Plugin enviado. Ative em <span className="font-mono">wp-admin → Plugins</span> e clique abaixo.
              </p>
              {onRevalidate && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onRevalidate(site)}
                  className="min-h-[44px]"
                >
                  Já ativei, validar agora
                </Button>
              )}
            </>
          )}

          {!isUnsupported && (isInstalled || isFailed) && onViewDetails && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => onViewDetails(site)}
              className="min-h-[44px]"
            >
              Ver detalhes
            </Button>
          )}

          {!isUnsupported && isInstalled && onRevalidate && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => onRevalidate(site)}
              className="min-h-[44px]"
            >
              Revalidar
            </Button>
          )}

          {!isUnsupported && isInstalled && onReinstall && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => onReinstall(site)}
              className="min-h-[44px]"
            >
              Reinstalar
            </Button>
          )}

          {!isUnsupported && isFailed && onInstall && (
            <Button
              variant="primary"
              size="md"
              onClick={() => site.brand_slug && onInstall(site, site.brand_slug)}
              disabled={!site.brand_slug}
              className="min-h-[44px]"
            >
              Tentar novamente
            </Button>
          )}

          {isUnsupported && (
            <p className="text-caption text-fg-on-light-muted text-right">
              Esse provedor exige WordPress.
            </p>
          )}

          {!isUnsupported && isPendingActivation && onViewDetails && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => onViewDetails(site)}
              className="min-h-[44px]"
            >
              Ver detalhes
            </Button>
          )}

          {!isUnsupported && onViewDetails && status === 'not_installed' && (
            <button
              type="button"
              onClick={() => onViewDetails(site)}
              aria-label="Mais ações"
              className={cn(
                'inline-flex items-center justify-center h-11 w-11 rounded-md',
                'text-fg-on-light-muted hover:bg-bg-muted',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
                'transition-colors',
              )}
            >
              <DotsThree size={18} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
