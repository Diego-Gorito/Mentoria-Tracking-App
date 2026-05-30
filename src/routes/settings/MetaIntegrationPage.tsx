/**
 * MetaIntegrationPage — conector Meta (Facebook) Ads via System User Token paste.
 *
 * Rota: /integracoes/meta
 *
 * Wizard de 4 passos (install-first, sem OAuth):
 *   A — Guia: como gerar o System User token no Business Manager
 *   B — Token: cola o token, valida via Graph /me
 *   C — Seleção: escolhe ad account + pixel (dropdowns dependentes)
 *   D — Done: pixel conectado ao container GTM (CAPI)
 *
 * @see workers/api/meta.ts
 * @see src/hooks/useMetaIntegration.ts
 */

import { AppShell } from '@/components/layout/AppShell'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'
import { useMetaIntegration, type MetaWizardStep } from '@/hooks/useMetaIntegration'
import { MetaTokenGuide } from '@/components/meta/MetaTokenGuide'
import { MetaConnectStep } from '@/components/meta/MetaConnectStep'
import { MetaSelectStep } from '@/components/meta/MetaSelectStep'
import { MetaDoneStep } from '@/components/meta/MetaDoneStep'
import { cn } from '@/lib/utils'

interface Props {
  onNavigate?: (href: string) => void
}

const STEP_LABELS: { key: MetaWizardStep; n: number; label: string }[] = [
  { key: 'guide', n: 1, label: 'Guia' },
  { key: 'token', n: 2, label: 'Token' },
  { key: 'select', n: 3, label: 'Conta + Pixel' },
  { key: 'done', n: 4, label: 'Pronto' },
]

function stepIndex(s: MetaWizardStep): number {
  return STEP_LABELS.findIndex((x) => x.key === s)
}

export function MetaIntegrationPage({ onNavigate }: Props) {
  const { toast } = useToast()
  const meta = useMetaIntegration()
  const activeIdx = stepIndex(meta.step)

  return (
    <AppShell activePath="/integracoes/meta" onNavigate={onNavigate}>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header>
          <h1 className="text-h4 font-semibold text-fg-on-dark">Meta Ads</h1>
          <p className="text-body-sm text-fg-on-dark-muted mt-1">
            Conecte sua conta de anúncios do Meta (Facebook) e ative o pixel via
            Conversions API — sem login complicado, só colando um token.
          </p>
        </header>

        {/* Stepper */}
        <ol className="flex items-center gap-2" aria-label="Progresso da conexão Meta">
          {STEP_LABELS.map((s, i) => {
            const done = i < activeIdx
            const active = i === activeIdx
            return (
              <li key={s.key} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-caption font-semibold transition-colors',
                      active && 'bg-brand-green text-brand-black',
                      done && 'bg-brand-green/20 text-brand-green',
                      !active && !done && 'bg-white/[0.06] text-fg-on-dark-subtle',
                    )}
                    aria-current={active ? 'step' : undefined}
                  >
                    {s.n}
                  </span>
                  <span
                    className={cn(
                      'text-caption hidden sm:inline',
                      active ? 'text-fg-on-dark font-medium' : 'text-fg-on-dark-subtle',
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <span
                    className={cn(
                      'h-px flex-1',
                      i < activeIdx ? 'bg-brand-green/40' : 'bg-white/10',
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>

        {/* Loading inicial do status */}
        {meta.statusLoading && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
            <div className="text-body-sm text-fg-on-dark-muted">Carregando…</div>
          </div>
        )}

        {meta.statusError && !meta.statusLoading && (
          <ErrorState
            message={`Erro ao carregar status: ${meta.statusError}`}
            onRetry={meta.refresh}
          />
        )}

        {!meta.statusLoading && !meta.statusError && (
          <>
            {meta.step === 'guide' && (
              <MetaTokenGuide onContinue={() => meta.setStep('token')} />
            )}

            {meta.step === 'token' && (
              <MetaConnectStep
                connecting={meta.connecting}
                error={meta.connectError}
                onConnect={meta.connect}
                onBack={() => meta.setStep('guide')}
              />
            )}

            {meta.step === 'select' && (
              <MetaSelectStep
                adAccounts={meta.adAccounts}
                pixels={meta.pixels}
                pixelsLoading={meta.pixelsLoading}
                selecting={meta.selecting}
                error={meta.selectError}
                onLoadPixels={meta.loadPixels}
                onSelect={async (adAccountId, pixelId) => {
                  const ok = await meta.selectPixel(adAccountId, pixelId)
                  if (ok) toast('Pixel conectado ao container!', 'success', 4000)
                }}
              />
            )}

            {meta.step === 'done' && (
              <MetaDoneStep
                pixelId={meta.status?.pixel_id ?? null}
                containerSynced={meta.containerSynced}
                syncDetail={meta.syncDetail}
                onGoDashboard={() => onNavigate?.('dashboard')}
                onDisconnect={async () => {
                  await meta.disconnect()
                  toast('Meta desconectado', 'info', 3000)
                }}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
