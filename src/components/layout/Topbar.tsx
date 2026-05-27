// Topbar — Mentoria Tracking App
// Tenant slug pill + theme toggle + avatar + sign-out.
// Command Palette ⌘K: placeholder visual, lógica implementada em Era 2.
// A11y: todos botões têm aria-label explícito.

import { Sun, Moon, SignOut, MagnifyingGlass, Bell, Plus } from '@phosphor-icons/react'
import { useTheme } from '@/lib/theme'
import { clearToken } from '@/lib/auth'
import { getUser } from '@/lib/auth'
import { Logo } from '@/components/ui/Logo'
import { useTenant } from '@/hooks/useTenant'

type Props = {
  onMenuOpen?: () => void
}

export function Topbar({ onMenuOpen }: Props) {
  const { theme, toggle } = useTheme()
  const user = getUser()
  const { tenant } = useTenant()

  function handleLogout() {
    clearToken()
    window.location.href = '/login'
  }

  return (
    <header
      className="h-topbar-height flex items-center justify-between px-4 md:px-6 border-b border-white/5 shrink-0 gap-3"
      style={{ background: 'var(--app-sidebar-bg)' }}
    >
      {/* Mobile: hamburger + logo */}
      <div className="flex items-center gap-3 shrink-0">
        {onMenuOpen && (
          <button
            type="button"
            onClick={onMenuOpen}
            aria-label="Abrir menu de navegação"
            className="md:hidden h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-fg-on-dark-muted"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 4.5h14M2 9h14M2 13.5h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <div className="md:hidden flex items-center gap-2">
          <Logo variant="green" size="sm" />
          <span className="text-body-sm font-semibold text-fg-on-dark tracking-tight">
            Tracking
          </span>
        </div>
      </div>

      {/* Center: tenant selector pill (desktop) */}
      <div className="hidden md:flex items-center flex-1 min-w-0">
        {tenant && (
          <button
            type="button"
            aria-label={`Tenant atual: ${tenant.name}. Clique para trocar.`}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-body-sm font-medium transition-colors hover:bg-white/[0.06]"
            style={{
              background: 'var(--app-pill-bg)',
              border: '1px solid var(--app-pill-border)',
              color: 'var(--app-pill-fg)',
            }}
          >
            <span
              className="h-2 w-2 rounded-full bg-brand-green shrink-0"
              aria-hidden="true"
            />
            <span className="truncate max-w-[180px]">{tenant.name}</span>
            <span className="text-fg-on-dark-subtle font-mono text-caption shrink-0">
              /{tenant.slug}
            </span>
          </button>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 md:gap-2 ml-auto md:ml-0 shrink-0">
        {/* Command Palette — placeholder visual, sem lógica (Era 2) */}
        <button
          type="button"
          aria-label="Buscar (⌘K)"
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-fg-on-dark-muted hover:text-fg-on-dark"
        >
          <MagnifyingGlass size={16} aria-hidden="true" />
        </button>

        {/* Adicionar integração — atalho rápido */}
        <button
          type="button"
          aria-label="Adicionar integração"
          onClick={() => {
            // Navega pra /integracoes com modal=new
            window.history.pushState({}, '', '/integracoes?modal=new')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}
          className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-lg text-body-sm font-medium transition-colors text-fg-on-dark-muted hover:bg-white/[0.06] hover:text-fg-on-dark"
        >
          <Plus size={14} aria-hidden="true" />
          <span>Integração</span>
        </button>

        {/* Notificações — placeholder */}
        <button
          type="button"
          aria-label="Notificações"
          className="relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-fg-on-dark-muted hover:text-fg-on-dark"
        >
          <Bell size={16} aria-hidden="true" />
          {/* Badge — descomente quando tiver count real */}
          {/* <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-green" aria-hidden="true" /> */}
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-fg-on-dark-muted hover:text-fg-on-dark"
        >
          {theme === 'dark' ? (
            <Sun size={16} aria-hidden="true" />
          ) : (
            <Moon size={16} aria-hidden="true" />
          )}
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-white/5 mx-1" aria-hidden="true" />

        {/* Avatar + logout */}
        {user && (
          <div className="flex items-center gap-2">
            {/* Avatar pill com inicial.
                Codex #4 follow-up (2026-05-27): user.email pode vir vazio/undefined
                de JWTs custom (ex: Custom Access Token Hook que esqueceu de
                preservar claim email). Guard defensivo evita crash do app. */}
            <div
              aria-label={`Usuário: ${user.email ?? 'sem email'}`}
              className="h-8 w-8 rounded-full bg-brand-green/20 border border-brand-green/30 flex items-center justify-center text-caption font-semibold text-brand-green select-none shrink-0"
            >
              {user.email?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair da conta"
              title="Sair"
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-fg-on-dark-muted hover:text-danger"
            >
              <SignOut size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
