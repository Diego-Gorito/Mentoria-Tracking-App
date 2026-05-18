import { cn, avatarColor, initials } from '@/lib/utils'

type Props = {
  name: string
  caption?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// DESIGN.md §5 + §7.3 — avatar com iniciais coloridas
export function AvatarWithName({ name, caption, size = 'md', className }: Props) {
  const sizes = {
    sm: { avatar: 'h-8 w-8 text-caption', name: 'text-body-sm', cap: 'text-caption' },
    md: { avatar: 'h-10 w-10 text-body-sm', name: 'text-body-md', cap: 'text-caption' },
    lg: { avatar: 'h-14 w-14 text-body-lg', name: 'text-heading-sm', cap: 'text-body-sm' },
  }
  const s = sizes[size]
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-semibold text-white shrink-0',
          avatarColor(name),
          s.avatar,
        )}
      >
        {initials(name)}
      </div>
      <div className="flex flex-col min-w-0">
        <span className={cn('font-medium text-brand-black truncate', s.name)}>{name}</span>
        {caption && <span className={cn('text-muted-text truncate', s.cap)}>{caption}</span>}
      </div>
    </div>
  )
}
