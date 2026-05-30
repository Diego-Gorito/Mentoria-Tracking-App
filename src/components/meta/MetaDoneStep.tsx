/**
 * MetaDoneStep — Step D do conector Meta Ads. Confirmação de sucesso + próximos
 * passos. Mostra se o pixel já foi gravado no container GTM ou se ficará pendente
 * pro provision.
 */

import { CheckCircle, Warning, ArrowSquareOut } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'

interface Props {
  pixelId: string | null
  /** true = pixel já escrito no container; false = container não existe ainda; null = desconhecido. */
  containerSynced: boolean | null
  syncDetail?: string
  onGoDashboard: () => void
  onDisconnect: () => void
}

export function MetaDoneStep({
  pixelId,
  containerSynced,
  syncDetail,
  onGoDashboard,
  onDisconnect,
}: Props) {
  const synced = containerSynced === true

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green/15">
          <CheckCircle size={22} weight="fill" className="text-brand-green" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-h6 font-semibold text-fg-on-dark">
            Meta conectado!
          </h3>
          <p className="text-body-sm text-fg-on-dark-muted mt-1">
            {pixelId ? (
              <>
                Pixel{' '}
                <code className="px-1 rounded bg-white/10 font-mono text-caption text-fg-on-dark">
                  {pixelId}
                </code>{' '}
                {synced
                  ? 'conectado ao seu container GTM. Os próximos eventos de conversão vão ser enviados via CAPI.'
                  : 'salvo na sua conexão Meta.'}
              </>
            ) : (
              'Conexão Meta ativa.'
            )}
          </p>
        </div>
      </div>

      {/* Aviso quando o container ainda não recebeu o pixel. */}
      {containerSynced === false && (
        <div className="rounded-md border border-warning/30 bg-warning/[0.06] p-3 flex gap-2">
          <Warning size={16} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-caption text-fg-on-dark-muted">
            {syncDetail ??
              'Seu container GTM ainda não foi provisionado. O pixel será aplicado automaticamente assim que você provisionar o container.'}
          </div>
        </div>
      )}

      <div className="rounded-md border border-white/10 bg-white/[0.02] p-4">
        <div className="text-body-sm font-medium text-fg-on-dark mb-1">
          Próximos passos
        </div>
        <ul className="text-caption text-fg-on-dark-muted space-y-1 list-disc pl-4">
          <li>As conversões do site vão pro Meta via Conversions API (server-side).</li>
          <li>Acompanhe no Gerenciador de Eventos do Meta a qualidade do match.</li>
          <li>
            Pra trocar de conta/pixel depois, é só desconectar e reconectar aqui.
          </li>
        </ul>
        <a
          href="https://business.facebook.com/events_manager2"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 text-body-sm text-brand-green hover:underline"
        >
          Abrir o Gerenciador de Eventos
          <ArrowSquareOut size={14} aria-hidden="true" />
        </a>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" onClick={onDisconnect}>
          Desconectar
        </Button>
        <Button variant="primary" onClick={onGoDashboard}>
          Ir pro dashboard
        </Button>
      </div>
    </div>
  )
}
