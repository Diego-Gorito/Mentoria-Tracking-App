/**
 * GtmStatusCard — display status do container GTM do tenant.
 *
 * Mostra:
 *  - Status (badge): not_provisioned | active | failed | cloning ...
 *  - Container IDs (web public, server public)
 *  - sGTM URL
 *  - Master version atual + se está outdated
 *  - last_published_at
 *  - Snippet copy (futuro)
 */

import { StatusBadge } from '@/components/ui/StatusBadge'
import type { GtmContainerInfo, GtmMasterVersion } from '@/hooks/useGtmContainer'

interface Props {
  info: GtmContainerInfo | null
  currentMaster: GtmMasterVersion | null
  isOutdated: boolean
}

function statusVariant(s?: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (s) {
    case 'active':
      return 'success'
    case 'cloning':
    case 'linking':
    case 'publishing':
    case 'pending':
      return 'info'
    case 'failed':
      return 'danger'
    case 'archived':
      return 'neutral'
    default:
      return 'neutral' // not_provisioned
  }
}

function statusLabel(s?: string): string {
  switch (s) {
    case 'active':
      return 'Ativo'
    case 'cloning':
      return 'Clonando…'
    case 'linking':
      return 'Linkando…'
    case 'publishing':
      return 'Publicando…'
    case 'pending':
      return 'Pendente'
    case 'failed':
      return 'Falhou'
    case 'archived':
      return 'Arquivado'
    default:
      return 'Não provisionado'
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

export function GtmStatusCard({ info, currentMaster, isOutdated }: Props) {
  const status = info?.status ?? 'not_provisioned'

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-h6 font-semibold text-fg-on-dark">
            GTM Container
          </h3>
          <p className="text-body-sm text-fg-on-dark-muted mt-1">
            Tags & pixels gerenciados via Google Tag Manager
          </p>
        </div>
        <StatusBadge status={statusVariant(status)}>
          {statusLabel(status)}
        </StatusBadge>
      </div>

      {status === 'not_provisioned' && (
        <p className="text-body-sm text-fg-on-dark-muted">
          Nenhum container ainda. Provisione abaixo para clonar o master atual.
        </p>
      )}

      {status === 'failed' && info?.error_message && (
        <div className="rounded bg-danger/10 border border-danger/30 p-3 mb-4">
          <div className="text-caption text-danger font-medium">
            Falhou em: {info.failed_at_step ?? 'unknown'}
          </div>
          <div className="text-body-sm text-fg-on-dark mt-1">
            {info.error_message}
          </div>
        </div>
      )}

      {info?.web_container_public_id && (
        <dl className="grid grid-cols-2 gap-4 text-body-sm">
          <div>
            <dt className="text-caption text-fg-on-dark-muted">Web Container</dt>
            <dd className="font-mono text-fg-on-dark">
              {info.web_container_public_id}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-fg-on-dark-muted">Server Container</dt>
            <dd className="font-mono text-fg-on-dark">
              {info.server_container_public_id ?? '—'}
            </dd>
          </div>
          {info.sgtm_url && (
            <div className="col-span-2">
              <dt className="text-caption text-fg-on-dark-muted">sGTM URL</dt>
              <dd className="font-mono text-fg-on-dark break-all">
                {info.sgtm_url}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-caption text-fg-on-dark-muted">
              Master version
            </dt>
            <dd className="text-fg-on-dark">
              {info.master_version?.version_name ?? '—'}
              {isOutdated && currentMaster && (
                <span className="ml-2 text-caption text-warning">
                  (atual: {currentMaster.version_name})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-fg-on-dark-muted">
              Última publicação
            </dt>
            <dd className="text-fg-on-dark">
              {formatDate(info.last_published_at)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}
