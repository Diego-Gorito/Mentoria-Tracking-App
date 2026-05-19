// StepPolling.tsx — 3 estados de verificação de tracking: aguardando / recebido / timeout
// aria-live="polite" no container; aria-live="assertive" quando recebido.
// CircleNotch animate-spin substituído por "..." se prefers-reduced-motion.

import { CircleNotch, CheckCircle, ClockCountdown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

type PollingStatus = 'waiting' | 'received' | 'timeout'

type ReceivedEvent = {
  source: string
  type?: string
  received_at: string
}

type Props = {
  status: PollingStatus
  elapsedSeconds: number
  receivedEvent?: ReceivedEvent
  onForceCheck: () => void
  onContinueAnyway: () => void
  onRetry: () => void
  className?: string
}

function relativeTime(isoDate: string): string {
  const diff = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (diff < 60) return `há ${diff}s`
  const mins = Math.floor(diff / 60)
  return `há ${mins} min`
}

export function StepPolling({
  status,
  elapsedSeconds,
  receivedEvent,
  onForceCheck,
  onContinueAnyway,
  onRetry,
  className,
}: Props) {
  return (
    <div
      aria-live={status === 'received' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={cn('rounded-xl p-5', className, {
        'border border-amber-500/20 bg-amber-500/[0.04]': status === 'waiting',
        'border border-brand-green/30 bg-brand-green/[0.06]': status === 'received',
        'border border-white/10 bg-white/[0.02]': status === 'timeout',
      })}
    >
      {/* AGUARDANDO */}
      {status === 'waiting' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <CircleNotch
              size={24}
              weight="bold"
              role="status"
              aria-label="Verificando eventos"
              className="text-amber-400 shrink-0 mt-0.5 motion-safe:animate-spin motion-reduce:opacity-70"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-body-md text-fg-on-dark">Aguardando primeiro evento...</p>
              <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
                Acesse qualquer página do seu site após instalar o snippet. Pode levar até 1 minuto.
              </p>
              <p className="text-caption text-fg-on-dark-subtle mt-1">
                Verificando há {elapsedSeconds} segundo{elapsedSeconds !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" type="button" onClick={onForceCheck}>
              Verificar agora
            </Button>
          </div>
        </div>
      )}

      {/* RECEBIDO */}
      {status === 'received' && (
        <div className="flex items-start gap-3">
          <CheckCircle
            size={32}
            weight="fill"
            aria-hidden="true"
            className="text-brand-green shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-body-md text-fg-on-dark">Evento recebido!</p>
            <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
              Recebemos um evento do seu site. O tracking está funcionando.
            </p>
            {receivedEvent && (
              <p className="text-caption text-fg-on-dark-subtle mt-1">
                Fonte: {receivedEvent.source} — {relativeTime(receivedEvent.received_at)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* TIMEOUT */}
      {status === 'timeout' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <ClockCountdown
              size={32}
              weight="duotone"
              aria-hidden="true"
              className="text-fg-on-dark-subtle shrink-0 mt-0.5"
              style={{ '--phosphor-duotone-secondary-opacity': '0.35' } as React.CSSProperties}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-body-md text-fg-on-dark">Nenhum evento detectado ainda</p>
              <p className="text-body-sm text-fg-on-dark-muted mt-0.5">
                Tudo bem — às vezes leva mais tempo. Você pode continuar e verificar depois em Configurações.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <Button variant="ghost" size="sm" type="button" onClick={onRetry}>
              Tentar novamente
            </Button>
            <Button size="sm" type="button" onClick={onContinueAnyway}>
              Continuar mesmo assim
            </Button>
          </div>
          <a
            href="https://docs.colegiomentoria.com.br/troubleshooting-tracking"
            target="_blank"
            rel="noopener noreferrer"
            className="text-caption text-brand-green hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded"
          >
            Ver guia de solução de problemas
          </a>
        </div>
      )}
    </div>
  )
}
