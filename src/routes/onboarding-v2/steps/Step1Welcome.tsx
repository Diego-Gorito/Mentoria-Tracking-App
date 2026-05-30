/**
 * Step1Welcome — boas-vindas + confirmação do tenant.
 *
 * Mostra:
 *  - Headline "Bem-vindo ao Mentoria Tracking" + nome do tenant
 *  - Resumo dos 4 passos (transparency, set expectations)
 *  - CTA "Vamos começar"
 *
 * Não chama API — apenas leitura do tenant do JWT via useTenant().
 * Se tenant ausente (signup falhou em provisionar), mostra link pra
 * Wizard V1 fallback (que tem o create-tenant).
 */

import { useId } from 'react';
import { Sparkle, GearSix, Cloud, Plug, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { useTenant } from '@/hooks/useTenant';

interface Props {
  onContinue: () => void;
  /** Callback pra ir pro Wizard V1 quando user precisa criar tenant manual. */
  onGoToLegacy?: () => void;
}

const STEPS_SUMMARY = [
  {
    icon: GearSix,
    title: 'Provisionar GTM',
    desc: 'Criamos seu container Google Tag Manager (web + server-side).',
  },
  {
    icon: Cloud,
    title: 'Conectar Hostinger',
    desc: 'Cole seu token e a gente detecta automaticamente seus sites.',
  },
  {
    icon: Plug,
    title: 'Instalar plugin',
    desc: 'O plugin GTM4WP é enviado pro seu WP. Você ativa em 2 cliques.',
  },
  {
    icon: CheckCircle,
    title: 'Validar tracking',
    desc: 'Confirmamos que os eventos chegam no GTM. Pronto pra rodar.',
  },
];

export function Step1Welcome({ onContinue, onGoToLegacy }: Props) {
  const uid = useId();
  const { tenant, loading } = useTenant();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-green border-t-transparent" />
      </div>
    );
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-6">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="h-14 w-14 rounded-full bg-brand-green/15 border border-brand-green/30 flex items-center justify-center">
          <Sparkle size={28} weight="fill" className="text-brand-green" aria-hidden="true" />
        </div>
        <h2
          id={`${uid}-title`}
          className="text-h2 font-semibold text-fg-on-dark"
          tabIndex={-1}
        >
          Bem-vindo ao Mentoria Tracking
        </h2>
        {tenant?.name && (
          <p className="text-body-lg text-fg-on-dark-muted">
            <span className="font-medium text-fg-on-dark">{tenant.name}</span>{' '}
            <span className="text-fg-on-dark-subtle">({tenant.slug})</span>
          </p>
        )}
        <p className="text-body-md text-fg-on-dark-muted max-w-md">
          Em <span className="font-medium text-fg-on-dark">4 passos</span> a
          gente sai do zero até seu site WordPress instrumentado com tracking
          server-side. Estimativa total: 10-15 minutos.
        </p>
      </div>

      {/* Resumo dos 4 passos */}
      <ol
        aria-label="O que vamos fazer nos próximos passos"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none"
      >
        {STEPS_SUMMARY.map((step, idx) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                  <Icon size={16} weight="bold" className="text-brand-green" aria-hidden="true" />
                </div>
                <span className="text-caption font-mono text-fg-on-dark-subtle">
                  Passo {idx + 1}
                </span>
              </div>
              <p className="text-body-md font-medium text-fg-on-dark">{step.title}</p>
              <p className="text-body-sm text-fg-on-dark-muted">{step.desc}</p>
            </li>
          );
        })}
      </ol>

      {/* Aviso tenant ausente — UX pra usuários cujo signup não provisionou tenant */}
      {!tenant && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-4 flex flex-col gap-2"
        >
          <p className="text-body-sm text-fg-on-dark">
            Sua escola ainda não foi criada na nossa base.
          </p>
          <p className="text-body-sm text-fg-on-dark-muted">
            Use o wizard antigo pra criar e voltar aqui depois.
          </p>
          {onGoToLegacy && (
            <button
              type="button"
              onClick={onGoToLegacy}
              className="text-body-sm text-brand-green hover:underline self-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded"
            >
              Ir pro setup completo →
            </button>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="flex justify-end pt-2">
        <Button
          type="button"
          size="lg"
          onClick={onContinue}
          disabled={!tenant}
          data-autofocus
        >
          Vamos começar →
        </Button>
      </div>
    </section>
  );
}
