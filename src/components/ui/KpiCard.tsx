import { cn } from '@/lib/utils'
import { TrendUp, TrendDown, type Icon } from '@phosphor-icons/react'

type Props = {
  label: string
  value: string
  variation?: { value: string; positive: boolean; suffix?: string }
  icon?: Icon
  positiveIsGood?: boolean
  className?: string
}

// DESIGN.md v1.3 — KPI card Stitch/Vercel polish
export function KpiCard({
  label,
  value,
  variation,
  icon: IconComp,
  positiveIsGood = true,
  className,
}: Props) {
  const isGoodTrend = variation && (positiveIsGood ? variation.positive : !variation.positive)

  return (
    <div className={cn('card card-hover p-7 flex flex-col gap-3 animate-fade-up', className)}>
      <div className="flex items-start justify-between">
        <span className="text-body-md text-fg-on-light-muted">{label}</span>
        {IconComp && (
          <div className="h-9 w-9 rounded-lg bg-bg-content flex items-center justify-center">
            <IconComp size={18} className="text-fg-on-light-subtle" weight="duotone" />
          </div>
        )}
      </div>
      <div className="font-mono font-semibold text-mono-display text-brand-black tabular-nums tracking-tight">
        {value}
      </div>
      {variation && (
        <div className="flex items-center gap-1.5 text-body-sm">
          {variation.positive ? (
            <TrendUp
              size={16}
              className={isGoodTrend ? 'text-success-text' : 'text-danger-text'}
              weight="bold"
            />
          ) : (
            <TrendDown
              size={16}
              className={isGoodTrend ? 'text-success-text' : 'text-danger-text'}
              weight="bold"
            />
          )}
          <span
            className={cn(
              'font-mono font-semibold tabular-nums',
              isGoodTrend ? 'text-success-text' : 'text-danger-text',
            )}
          >
            {variation.positive ? '+' : ''}
            {variation.value}
          </span>
          <span className="text-fg-on-light-subtle">
            {variation.suffix || 'vs período anterior'}
          </span>
        </div>
      )}
    </div>
  )
}
