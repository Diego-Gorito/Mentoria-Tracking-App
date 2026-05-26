// BrandSelect.tsx — F-S09 AC-2
// Dropdown com 4 brands hardcoded MVP (CLAUDE.md tabela).
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 Tela 3 + §10.2 + UX-010.
// A11y: <select> nativo (default behaviors free) + <label> sr-only htmlFor (WCAG AA).

import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { BrandSlug } from '@/types/sites'

type Props = {
  /** Slug atual. Undefined → placeholder "Selecionar…". */
  value?: BrandSlug
  /** Callback ao selecionar nova brand. */
  onChange: (slug: BrandSlug) => void
  /** Disabled pós-install (UX-010: prevent change pós-deploy MVP). */
  disabled?: boolean
  /** Label visível (default sr-only). */
  label?: string
  /** Id pro <label htmlFor>. Default useId(). */
  id?: string
  className?: string
}

/** Labels PT-BR humanos (UX §10.2). */
const BRAND_LABELS: Record<BrandSlug, string> = {
  mentoria: 'Colégio Mentoria',
  'mentoria-app': 'Mentoria APP',
  zerohum: 'Colégio Zerohum',
  ifrn: 'Blog IFRN',
}

const BRAND_OPTIONS: BrandSlug[] = ['mentoria', 'mentoria-app', 'zerohum', 'ifrn']

export function BrandSelect({
  value,
  onChange,
  disabled = false,
  label = 'Brand',
  id,
  className,
}: Props) {
  const reactId = useId()
  const selectId = id ?? `brand-select-${reactId}`

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={selectId} className="sr-only">
        {label}
      </label>
      <select
        id={selectId}
        value={value ?? ''}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value as BrandSlug
          if (v) onChange(v)
        }}
        className={cn(
          'min-h-[44px] h-11 px-3 pr-8 rounded-md border bg-white text-body-sm text-brand-black',
          'border-border-default',
          'focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green',
          'disabled:bg-bg-muted disabled:text-fg-on-light-subtle disabled:cursor-not-allowed',
          'transition-colors',
        )}
      >
        <option value="" disabled>
          Selecionar…
        </option>
        {BRAND_OPTIONS.map((slug) => (
          <option key={slug} value={slug}>
            {BRAND_LABELS[slug]}
          </option>
        ))}
      </select>
    </div>
  )
}

export { BRAND_LABELS, BRAND_OPTIONS }
