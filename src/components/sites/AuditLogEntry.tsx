// AuditLogEntry.tsx — F-S09 AC-8
// Renderiza 1 row de audit log com expand/collapse pra payload completo.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela detalhe site (audit em lista).
// A11y: aria-expanded no toggle, payload em <pre> com role="region".

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CaretDown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { AuditAction, InstallationAudit } from '@/types/sites'

type Props = {
  entry: InstallationAudit
  className?: string
}

/** Labels PT-BR humanos por action (UX-ish, AC-8). */
const ACTION_LABELS: Record<AuditAction, string> = {
  draft_created: 'Rascunho criado',
  upload_started: 'Iniciado upload',
  upload_complete: 'Upload concluído',
  upload_failed: 'Upload falhou',
  activation_started: 'Iniciada ativação',
  activation_complete: 'Plugin ativado',
  activation_failed: 'Ativação falhou',
  validation_passed: 'Validação OK',
  validation_failed: 'Validação falhou',
  uninstalled: 'Desinstalado',
  token_refresh: 'Token renovado',
}

/** Mapa action → variant de StatusBadge (UX §4.2). */
function badgeStatusFor(
  action: AuditAction,
): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (action) {
    case 'upload_complete':
    case 'activation_complete':
    case 'validation_passed':
      return 'success'
    case 'upload_failed':
    case 'activation_failed':
    case 'validation_failed':
      return 'danger'
    case 'uninstalled':
      return 'warning'
    case 'token_refresh':
      return 'info'
    case 'upload_started':
    case 'activation_started':
      return 'info'
    case 'draft_created':
    default:
      return 'neutral'
  }
}

/** Timestamp PT-BR: "25/05/2026 14:32:01". */
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return format(d, "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
}

/** Abridge payload pra preview de 1 linha (max 80 chars). */
function abridgePayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload)
  if (json === '{}') return 'Sem detalhes'
  if (json.length <= 80) return json
  return `${json.slice(0, 77)}…`
}

export function AuditLogEntry({ entry, className }: Props) {
  const [expanded, setExpanded] = useState(false)
  const label = ACTION_LABELS[entry.action] ?? entry.action
  const badgeVariant = badgeStatusFor(entry.action)
  const preview = abridgePayload(entry.payload)
  const hasPayload = Object.keys(entry.payload).length > 0
  const regionId = `audit-payload-${entry.id}`

  return (
    <li
      className={cn(
        'flex flex-col gap-2 px-4 py-3 border-b border-border-subtle last:border-b-0',
        'hover:bg-bg-content transition-colors',
        className,
      )}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <time
          dateTime={entry.created_at}
          className="text-caption font-mono text-fg-on-light-muted tabular-nums shrink-0"
        >
          {formatTimestamp(entry.created_at)}
        </time>
        <span className="text-body-sm font-medium text-brand-black flex-1 min-w-0">{label}</span>
        <StatusBadge status={badgeVariant}>{label}</StatusBadge>
      </div>

      <div className="flex items-start gap-2">
        <p
          className={cn(
            'text-caption font-mono text-fg-on-light-subtle flex-1 min-w-0',
            !expanded && 'truncate',
          )}
        >
          {preview}
        </p>
        {hasPayload && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={regionId}
            aria-label={expanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            className={cn(
              'inline-flex items-center justify-center h-7 w-7 rounded-md shrink-0',
              'text-fg-on-light-muted hover:bg-bg-muted',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green',
              'transition-colors',
            )}
          >
            <CaretDown
              size={14}
              weight="bold"
              className={cn(
                'transition-transform duration-base motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
            />
          </button>
        )}
      </div>

      {expanded && hasPayload && (
        <pre
          id={regionId}
          role="region"
          aria-label="Detalhes do evento"
          className="text-caption font-mono text-fg-on-light bg-bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all"
        >
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </li>
  )
}

export { ACTION_LABELS }
