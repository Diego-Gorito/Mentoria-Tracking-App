// Sidebar — Mentoria Tracking App
// 6 items fixos do Tracking (sem personas/menus dinâmicos do ERP).
// A11y: aria-current="page" na rota ativa, aria-label na aside.

import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui/Logo'
import { MENU_ITEMS } from '@/data/menu'

type Props = {
  activePath?: string
  onSelect?: (href: string) => void
  /** Dentro de drawer mobile */
  inDrawer?: boolean
}

export function Sidebar({ activePath, onSelect, inDrawer = false }: Props) {
  return (
    <aside
      aria-label="Navegação principal"
      className={cn(
        'flex flex-col shrink-0',
        !inDrawer && 'hidden md:flex w-sidebar-width',
        inDrawer && 'w-full h-full',
      )}
      style={
        inDrawer
          ? { background: 'var(--app-sidebar-bg)' }
          : {
              background: 'var(--app-sidebar-bg)',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }
      }
    >
      {/* Header: logo + "Tracking" como sub-produto */}
      <div className="h-topbar-height px-6 flex items-center gap-2.5 border-b border-white/5 shrink-0">
        <Logo variant="green" size="sm" />
        <div className="flex flex-col">
          <span className="text-body-sm font-semibold text-fg-on-dark tracking-tight leading-none">
            Mentoria
          </span>
          <span className="text-caption font-mono text-brand-green/70 leading-none mt-0.5">
            Tracking
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1" aria-label="Menu principal">
        {MENU_ITEMS.map((item) => {
          const isActive =
            activePath === item.path ||
            (item.path !== '/dashboard' && activePath?.startsWith(item.path + '/'))
          const Icon = item.icon
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => onSelect?.(item.path)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.description}
              title={item.description}
              className={cn(
                'w-full flex items-center gap-3 h-10 px-3 rounded-lg text-body-sm font-medium transition-colors text-left',
                isActive
                  ? 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                  : 'text-fg-on-sidebar-muted hover:bg-white/[0.05] hover:text-fg-on-sidebar',
              )}
            >
              <Icon
                size={16}
                weight={isActive ? 'fill' : 'regular'}
                aria-hidden="true"
                className={isActive ? 'text-brand-green' : 'text-fg-on-sidebar-subtle'}
              />
              <span>{item.label}</span>
              {item.badge !== null && (
                <span
                  className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-brand-green/15 text-brand-green text-caption font-mono flex items-center justify-center"
                  aria-label={`${item.badge} pendentes`}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer: tenant slug */}
      <div className="px-4 py-4 border-t border-white/5">
        <p className="text-caption text-fg-on-sidebar-subtle truncate">
          Era 1 — MVP
        </p>
      </div>
    </aside>
  )
}
