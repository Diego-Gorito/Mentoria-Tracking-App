import { cn } from '@/lib/utils'

type Status = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

type Props = {
  status: Status
  children: React.ReactNode
  className?: string
}

// DESIGN.md v1.3 — Badge com dot indicator (Vercel style) + tons warmer
const styles: Record<Status, { bg: string; border: string; text: string; dot: string }> = {
  success: {
    bg: 'bg-[#ECFDF5]',
    border: 'border-[#A7F3D0]/40',
    text: 'text-success-text',
    dot: 'bg-success',
  },
  info: {
    bg: 'bg-[#F0FDFA]',
    border: 'border-[#99F6E4]/50',
    text: 'text-info-text',
    dot: 'bg-info',
  },
  warning: {
    bg: 'bg-[#FFFBEB]',
    border: 'border-[#FCD34D]/40',
    text: 'text-warning-text',
    dot: 'bg-warning',
  },
  danger: {
    bg: 'bg-[#FEF2F2]',
    border: 'border-[#FECACA]/50',
    text: 'text-danger-text',
    dot: 'bg-danger',
  },
  neutral: {
    bg: 'bg-bg-muted',
    border: 'border-border-subtle',
    text: 'text-fg-on-light-muted',
    dot: 'bg-zinc-400',
  },
}

export function StatusBadge({ status, children, className }: Props) {
  const s = styles[status]
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md border text-caption font-medium whitespace-nowrap',
        s.bg,
        s.border,
        s.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full mr-1.5 shrink-0', s.dot)} />
      {children}
    </span>
  )
}
