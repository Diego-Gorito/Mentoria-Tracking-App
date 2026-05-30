/**
 * Step3ConnectHosting — conecta conta Hostinger + escolhe site.
 *
 * Flow:
 *  1. Se user JÁ tem account conectado (recovery) → pula direto pra
 *     SitesSelector.
 *  2. Senão → ConnectHostingerForm. Após connect success, mostra
 *     SitesSelector na mesma tela.
 *  3. Quando user escolhe um site → habilita CTA "Continuar com {site}".
 *
 * Botão "Pular esta etapa" (link discreto) leva direto pra Step "vou
 * configurar depois" — ver Wizard pra handle.
 */

import { useId, useState, useEffect } from 'react';
import { Cloud } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { ConnectHostingerForm } from '@/components/onboarding/ConnectHostingerForm';
import { SitesSelector } from '@/components/onboarding/SitesSelector';
import { useHostingerAccount } from '@/hooks/useHostingerAccount';
import { useSites } from '@/hooks/useSites';
import type { EnrichedSite } from '@/types/sites';

interface Props {
  /** Account ID + site domain pre-selecionados (recovery). */
  initialAccountId?: string;
  initialSiteDomain?: string;
  /** Disparado quando user escolhe site + clica Continuar. */
  onComplete: (data: { hostingAccountId: string; site: EnrichedSite }) => void;
  /** User pulou esse step ("vou configurar depois"). */
  onSkip: () => void;
  onBack: () => void;
}

export function Step3ConnectHosting({
  initialSiteDomain,
  onComplete,
  onSkip,
  onBack,
}: Props) {
  const uid = useId();
  const { account, isConnected } = useHostingerAccount();
  const { refresh: refreshSites } = useSites();
  const [selectedSite, setSelectedSite] = useState<EnrichedSite | null>(null);
  const [accountSeen, setAccountSeen] = useState(false);

  // Recovery — se o domain inicial veio, mantém pre-selected.
  // SitesSelector já recebe selectedDomain via prop.

  // Quando account aparece (logo após connect()), força refresh do useSites
  // pra detectar os sites WP. Sem isso, o hook ficaria com cache vazio do
  // mount inicial (quando account era null).
  useEffect(() => {
    if (account?.id && !accountSeen) {
      setAccountSeen(true);
      void refreshSites();
    }
  }, [account?.id, accountSeen, refreshSites]);

  const hasAccount = isConnected && account?.id;
  const canContinue = !!hasAccount && !!selectedSite;

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Cloud size={20} weight="duotone" className="text-brand-green" aria-hidden="true" />
          <span className="text-caption font-mono text-fg-on-dark-subtle uppercase tracking-wide">
            Passo 3 de 4
          </span>
        </div>
        <h2
          id={`${uid}-title`}
          className="text-h2 font-semibold text-fg-on-dark"
          tabIndex={-1}
        >
          Conecte sua Hostinger
        </h2>
        <p className="text-body-md text-fg-on-dark-muted">
          Cole seu token Hostinger pra detectarmos os sites WordPress
          automaticamente. Token criptografado antes de salvar.
        </p>
      </header>

      {!hasAccount && (
        <ConnectHostingerForm
          // useHostingerAccount já reagiu via setAccount internamente —
          // próxima render mostra SitesSelector automatico via isConnected.
          // Callback fica como signal opcional pra logs/analytics.
          allowSkip
          onSkip={onSkip}
          submitLabel="Conectar e detectar sites"
        />
      )}

      {hasAccount && (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-brand-green/30 bg-brand-green/[0.06] p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-brand-green/20 flex items-center justify-center shrink-0">
              <Cloud size={16} weight="fill" className="text-brand-green" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-medium text-fg-on-dark">
                Conectado: <span className="font-mono">{account?.account_label ?? 'Hostinger'}</span>
              </p>
              <p className="text-caption text-fg-on-dark-subtle">
                Status: {account?.status === 'active' ? 'ativo' : (account?.status ?? '—')}
              </p>
            </div>
          </div>

          <SitesSelector
            onSelect={setSelectedSite}
            selectedDomain={initialSiteDomain}
          />
        </div>
      )}

      {/* Footer ações */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
        <Button variant="ghost" type="button" onClick={onBack}>
          ← Voltar
        </Button>
        <div className="flex items-center gap-3">
          {hasAccount && (
            <button
              type="button"
              onClick={onSkip}
              className="text-body-sm text-fg-on-dark-subtle hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
            >
              Pular esta etapa
            </button>
          )}
          {hasAccount && (
            <Button
              type="button"
              size="lg"
              disabled={!canContinue}
              onClick={() => {
                if (selectedSite && account?.id) {
                  onComplete({ hostingAccountId: account.id, site: selectedSite });
                }
              }}
            >
              {selectedSite
                ? `Continuar com ${truncate(selectedSite.domain, 28)} →`
                : 'Selecione um site →'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
