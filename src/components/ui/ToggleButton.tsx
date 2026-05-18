import type { ReactNode } from 'react'

type ToggleButtonProps = {
  pressed: boolean
  onPress: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  'aria-label'?: string
}

// Pill toggle padronizado com aria-pressed (Squad A11y FIX P0, 11/05/2026).
// Substitui pills "filtro" espalhadas que usavam apenas variação visual sem
// semântica acessível.
export function ToggleButton({
  pressed,
  onPress,
  children,
  size = 'md',
  disabled,
  'aria-label': ariaLabel,
}: ToggleButtonProps) {
  const sizeCls =
    size === 'sm' ? 'h-8 px-3 text-xs' : size === 'lg' ? 'h-12 px-5 text-sm' : 'h-10 px-4 text-sm'
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      className={`${sizeCls} inline-flex items-center gap-2 rounded-full font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
        pressed
          ? 'bg-brand-green text-brand-black shadow-glow-green'
          : 'bg-white/[0.04] text-fg-on-dark-subtle border border-white/10 hover:bg-white/[0.08]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  )
}

export function ToggleGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {children}
    </div>
  )
}
