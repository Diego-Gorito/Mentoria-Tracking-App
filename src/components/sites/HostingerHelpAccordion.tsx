// HostingerHelpAccordion.tsx — F-S09 AC-7
// Accordion com 4 passos pra gerar token Hostinger.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 2 (default open primeira visita).
// A11y: <details>/<summary> HTML5 (native expand/collapse + keyboard + screen reader free).

import { ArrowSquareOut, CaretDown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type Props = {
  /** Default open. UX: aberto na primeira visita à tela. */
  defaultOpen?: boolean
  className?: string
}

const HPANEL_URL = 'https://hpanel.hostinger.com'

const STEPS: Array<{ n: number; text: string }> = [
  { n: 1, text: 'Acesse hpanel.hostinger.com' },
  { n: 2, text: 'Vá em Conta → Acesso API' },
  { n: 3, text: 'Clique "Gerar token" e copie o valor' },
  {
    n: 4,
    text: 'Cole abaixo. Vamos criptografar antes de armazenar (Supabase Vault).',
  },
]

export function HostingerHelpAccordion({ defaultOpen = true, className }: Props) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        'group rounded-lg border border-border-default bg-white overflow-hidden',
        // motion-reduce respeitado: <details> nativo já não anima (sem CSS height transition aqui).
        className,
      )}
    >
      <summary
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none',
          'min-h-[44px]',
          'text-body-sm font-medium text-brand-black',
          'hover:bg-bg-content',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
          'list-none [&::-webkit-details-marker]:hidden',
        )}
      >
        <span>Como obter seu token Hostinger?</span>
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className="text-fg-on-light-muted transition-transform duration-base group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>

      <div className="px-4 py-4 border-t border-border-subtle bg-bg-content">
        <ol className="flex flex-col gap-2.5 list-none">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-3 text-body-sm text-fg-on-light leading-relaxed">
              <span
                aria-hidden="true"
                className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-bg-muted text-fg-on-light-muted font-mono text-caption font-semibold"
              >
                {step.n}
              </span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>

        <a
          href={HPANEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'mt-4 inline-flex items-center gap-1.5 min-h-[44px] h-10 px-4 rounded-md',
            'border border-border-default bg-white text-body-sm font-medium text-brand-black',
            'hover:bg-bg-muted active:bg-zinc-200',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
            'transition-colors',
          )}
        >
          Abrir hPanel em nova aba
          <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
        </a>
      </div>
    </details>
  )
}
