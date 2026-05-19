// Step2Tracking.tsx — Script de Tracking + polling automático
// Polling GET /api/onboarding/check-tracking a cada 10s, máx 5 min.
// 3 estados: waiting / received / timeout via StepPolling.
// Callout WordPress colapsável.

import { useEffect, useId, useRef, useState } from 'react'
import { onboardingApi } from '@/lib/api'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { StepPolling } from '@/components/ui/StepPolling'

const GTM_SNIPPET = `<!-- Google Tag Manager -- Mentoria Tracking -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PPVPWNXG');</script>
<!-- Fim Google Tag Manager -->`

const POLL_INTERVAL_MS = 10_000
const POLL_MAX_MS = 5 * 60 * 1000 // 5 min

type PollingStatus = 'waiting' | 'received' | 'timeout'

type ReceivedEvent = { source: string; type: string; received_at: string }

type Props = {
  onVerified: (verified: boolean) => void
}

export function Step2Tracking({ onVerified }: Props) {
  const uid = useId()
  const [wpOpen, setWpOpen] = useState(true)
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>('waiting')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [receivedEvent, setReceivedEvent] = useState<ReceivedEvent | undefined>()
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(Date.now())
  const pollingRef = useRef(true)

  async function doPoll() {
    if (!pollingRef.current) return
    try {
      const result = await onboardingApi.checkTracking()
      if (result.received) {
        setPollingStatus('received')
        setReceivedEvent(result.event as ReceivedEvent | undefined)
        onVerified(true)
        stopPolling()
      } else if (Date.now() - startTimeRef.current >= POLL_MAX_MS) {
        setPollingStatus('timeout')
        stopPolling()
      }
    } catch {
      // silently ignore network error during polling
    }
  }

  function stopPolling() {
    pollingRef.current = false
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
  }

  function startPolling() {
    pollingRef.current = true
    startTimeRef.current = Date.now()
    setElapsedSeconds(0)
    setPollingStatus('waiting')
    pollTimerRef.current = setInterval(doPoll, POLL_INTERVAL_MS)
    elapsedTimerRef.current = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000)),
      1000,
    )
    // Poll imediato na primeira vez
    void doPoll()
  }

  useEffect(() => {
    startPolling()
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleForceCheck() {
    void doPoll()
  }

  function handleContinueAnyway() {
    stopPolling()
    onVerified(false)
  }

  function handleRetry() {
    stopPolling()
    startPolling()
  }

  return (
    <section aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="text-h2 font-semibold text-fg-on-dark mb-1">
        Script de Tracking
      </h2>
      <p className="text-body-md text-fg-on-dark-muted mb-6">
        Instale o snippet abaixo para que seu site comece a enviar dados.
      </p>

      <div className="flex flex-col gap-6">
        {/* Instrução + snippet */}
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-fg-on-dark">
            Cole no <code className="text-brand-green font-mono text-caption">&lt;head&gt;</code> de todas as páginas do seu site.
          </p>
          <CodeBlock
            code={GTM_SNIPPET}
            label="Snippet GTM"
            ariaLabel="Snippet GTM para copiar"
          />
          <p className="text-caption text-fg-on-dark-subtle">
            O container ID GTM-PPVPWNXG já está configurado para o seu tenant.
          </p>
        </div>

        {/* Callout WordPress */}
        <div
          role="region"
          aria-label="Instruções para WordPress"
          className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
        >
          <button
            type="button"
            aria-expanded={wpOpen}
            aria-controls={`${uid}-wp-content`}
            onClick={() => setWpOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-body-sm font-medium text-fg-on-dark hover:bg-white/[0.03] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            <span>Usando WordPress?</span>
            <span aria-hidden="true" className={`transition-transform ${wpOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {wpOpen && (
            <div id={`${uid}-wp-content`} className="px-4 pb-4 flex flex-col gap-2 text-body-sm text-fg-on-dark-muted">
              <p>
                <strong className="text-fg-on-dark">Opção 1:</strong>{' '}
                Plugin GTM4WP — instale e cole o Container ID <code className="text-brand-green font-mono">GTM-PPVPWNXG</code> nas configurações.
              </p>
              <p>
                <strong className="text-fg-on-dark">Opção 2:</strong>{' '}
                Sem plugin — cole o snippet antes de{' '}
                <code className="text-brand-green font-mono">&lt;/head&gt;</code> no header.php do seu tema.
              </p>
              <a
                href="https://docs.colegiomentoria.com.br/gtm-wordpress"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-green hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded self-start"
              >
                Ver instruções detalhadas
              </a>
            </div>
          )}
        </div>

        {/* StepPolling */}
        <StepPolling
          status={pollingStatus}
          elapsedSeconds={elapsedSeconds}
          receivedEvent={receivedEvent}
          onForceCheck={handleForceCheck}
          onContinueAnyway={handleContinueAnyway}
          onRetry={handleRetry}
        />
      </div>
    </section>
  )
}
