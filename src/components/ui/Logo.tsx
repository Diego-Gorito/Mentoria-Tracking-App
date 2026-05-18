import { cn } from '@/lib/utils'

type Props = {
  variant?: 'green' | 'white'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  href?: string
}

// Wordmark "MENTORIA" — DESIGN.md §5.4
// NUNCA usar SVG genérico de chapéu/graduação.
export function Logo({ variant = 'green', size = 'md', className, href }: Props) {
  const sizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
  }
  const colors = {
    green: 'text-brand-green',
    white: 'text-brand-white',
  }
  const inner = (
    <span
      className={cn(
        'font-sans font-extrabold tracking-tight select-none',
        sizes[size],
        colors[variant],
        className,
      )}
      style={{ letterSpacing: '-0.02em' }}
    >
      MENTORIA
    </span>
  )
  if (href) {
    return (
      <a
        href={href}
        aria-label="Mentoria — Página inicial"
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green rounded"
      >
        {inner}
      </a>
    )
  }
  return inner
}
