// EmptyState.tsx — DESIGN.md v1.7
// Phosphor 48px Duotone (camada secundária opacity 0.35) + caption editorial display-md + CTA pill
// Substitui empty states inline espalhados pelo app (6+ ocorrências — vide DESIGN_v1.7_DRAFT.md §8)
//
// Uso:
//   <EmptyState
//     icon={UsersThree}
//     title="Nenhum aluno cadastrado ainda"
//     description="Cadastre o primeiro aluno da sua escola pra começar."
//     action={{ label: "Cadastrar primeiro aluno", onClick: handleCreate, icon: Plus }}
//   />

import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

type ActionProps = {
  label: string
  onClick: () => void
  icon?: PhosphorIcon
}

type Props = {
  icon: PhosphorIcon
  title: string
  description?: string
  action?: ActionProps
  className?: string
}

// v1.7: --icon-duotone-secondary: 0.35 aplicado via style inline na camada phosphor
// (Phosphor Duotone expõe camada secundária via opacity na propriedade data-* / CSS var)
export function EmptyState({ icon: Icon, title, description, action, className = '' }: Props) {
  return (
    <div className={`px-7 py-16 text-center flex flex-col items-center ${className}`}>
      {/* Ícone: Phosphor 48px Duotone com opacidade controlada na camada secundária */}
      <div
        className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/10 mb-5"
        aria-hidden="true"
      >
        <Icon
          size={48}
          weight="duotone"
          className="text-fg-on-dark-muted"
          // v1.7: opacidade 35% na camada secundária do Phosphor Duotone
          style={{ '--phosphor-duotone-secondary-opacity': '0.35' } as React.CSSProperties}
        />
      </div>

      {/* Caption editorial display-md — DESIGN.md §Tipografia */}
      <h3 className="text-display-md text-fg-on-dark mb-3 max-w-sm mx-auto leading-snug">
        {title}
      </h3>

      {description && (
        <p className="text-body-sm text-fg-on-dark-muted max-w-md mx-auto mb-6">{description}</p>
      )}

      {/* CTA pill — stitch-pill arredondado + brand-green */}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-brand-green text-brand-black font-semibold text-body-sm hover:bg-brand-green-bright hover:shadow-md hover:outline hover:outline-1 hover:outline-brand-green/30 hover:scale-[1.005] transition-all"
        >
          {action.icon && <action.icon size={14} weight="bold" />}
          {action.label}
        </button>
      )}
    </div>
  )
}
