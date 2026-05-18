import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'dark'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

// DESIGN.md v1.3 §6 — Button polido + variant `dark` Stitch/Vercel
const variants: Record<Variant, string> = {
  // v1.7: hover CTA primário — shadow-md + outline verde 20% + scale(1.005)
  // Deprecado: hover:shadow-glow-green-strong (cria "neon competition" em contexto de card)
  primary:
    'bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-md hover:outline hover:outline-1 hover:outline-brand-green/30 hover:scale-[1.005] active:bg-primary-active active:scale-[0.99] disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed disabled:shadow-none font-semibold',
  secondary:
    'border border-border-default bg-white text-brand-black hover:bg-bg-content hover:border-zinc-300 active:bg-bg-muted disabled:border-border-subtle disabled:text-zinc-400 shadow-xs',
  ghost: 'text-brand-black hover:bg-bg-muted active:bg-zinc-100 disabled:text-zinc-400',
  destructive:
    'bg-danger text-white hover:bg-red-600 active:bg-red-700 disabled:bg-zinc-300 font-semibold shadow-xs',
  dark: 'bg-bg-sidebar text-white hover:bg-bg-sidebar-hover active:bg-bg-sidebar-elevated font-semibold shadow-xs disabled:bg-zinc-300 disabled:text-zinc-500',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-body-sm',
  md: 'h-10 px-4 text-body-md',
  lg: 'h-12 px-6 text-body-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md transition-all duration-base ease-spring-out',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
        variants[variant],
        sizes[size],
        className,
      )}
      style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        children
      )}
    </button>
  )
}
