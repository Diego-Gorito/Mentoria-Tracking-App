// App.tsx — SPA router manual (sem react-router, mesmo padrão do ERP-Mentoria).
// Auth routes (login/signup/magic-link/onboarding) pertencem ao Dex — NÃO alterar.
// Routes de app (dashboard/tracking/conversoes/integracoes/leads/configuracoes) — Uma.

import { useState } from 'react'
import { ThemeProvider } from '@/lib/theme'
import { SpotlightProvider } from '@/lib/spotlight'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { PromptProvider } from '@/components/ui/PromptDialog'
import { isAuthenticated } from '@/lib/auth'

// Auth routes — Dex
import { Login } from '@/routes/auth/Login'
import { Signup } from '@/routes/auth/Signup'
import { MagicLink } from '@/routes/auth/MagicLink'
import { Wizard } from '@/routes/onboarding/Wizard'

// App routes — Uma
import { Dashboard } from '@/routes/dashboard/Dashboard'
import { Integrations } from '@/routes/settings/Integrations'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Pulse, Target, Users, Gear } from '@phosphor-icons/react'

type Route =
  | 'landing'
  | 'login'
  | 'signup'
  | 'magic-link'
  | 'onboarding'
  | 'dashboard'
  | 'tracking'
  | 'conversoes'
  | 'integracoes'
  | 'leads'
  | 'configuracoes'

function resolveInitialRoute(): Route {
  const path = window.location.pathname

  // Landing
  if (path === '/' || path === '') return 'landing'

  // Auth
  if (path === '/signup') return 'signup'
  if (path === '/magic-link') return 'magic-link'
  if (!isAuthenticated()) return 'login'

  // Onboarding
  if (path.startsWith('/onboarding')) return 'onboarding'

  // App routes
  if (path.startsWith('/tracking')) return 'tracking'
  if (path.startsWith('/conversoes')) return 'conversoes'
  if (path.startsWith('/integracoes') || path.startsWith('/settings/integrations'))
    return 'integracoes'
  if (path.startsWith('/leads')) return 'leads'
  if (path.startsWith('/configuracoes') || path.startsWith('/settings')) return 'configuracoes'

  return 'dashboard'
}

const VALID_ROUTES: Route[] = [
  'landing',
  'login',
  'signup',
  'magic-link',
  'onboarding',
  'dashboard',
  'tracking',
  'conversoes',
  'integracoes',
  'leads',
  'configuracoes',
]

export function App() {
  const [route, setRoute] = useState<Route>(resolveInitialRoute)

  function navigate(href: string) {
    const clean = href.replace(/^\//, '').split('?')[0]
    const matched = VALID_ROUTES.find((r) => clean === r || clean.startsWith(r + '/'))
    const target = (matched ?? 'dashboard') as Route
    setRoute(target)
    window.history.pushState({}, '', '/' + clean)
  }

  // Mapa de rota → caminho ativo (pra aria-current no Sidebar)
  const activePathMap: Record<Route, string> = {
    landing: '/',
    login: '/login',
    signup: '/signup',
    'magic-link': '/magic-link',
    onboarding: '/onboarding',
    dashboard: '/dashboard',
    tracking: '/tracking',
    conversoes: '/conversoes',
    integracoes: '/integracoes',
    leads: '/leads',
    configuracoes: '/configuracoes',
  }
  const activePath = activePathMap[route]

  return (
    <ThemeProvider>
      <SpotlightProvider>
        <ToastProvider>
          <ConfirmProvider>
            <PromptProvider>
              {/* Landing / raiz — CTA "Comecar gratis" */}
              {route === 'landing' && (
                <div
                  className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
                  style={{
                    background:
                      'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(22,223,111,0.10) 0%, transparent 60%), #0A0A0A',
                  }}
                >
                  <Logo variant="green" size="lg" className="mb-6" />
                  <h1 className="text-display-lg font-bold text-fg-on-dark mb-4 max-w-lg">
                    Mentoria Tracking
                  </h1>
                  <p className="text-body-lg text-fg-on-dark-muted max-w-md mb-8">
                    Cole 3 tokens, veja ROAS amanha. Tracking server-side multi-plataforma pra
                    escolas e cursinhos.
                  </p>
                  <Button size="lg" onClick={() => navigate('signup')}>
                    Comecar gratis
                  </Button>
                  <button
                    type="button"
                    onClick={() => navigate('login')}
                    className="mt-4 text-body-sm text-fg-on-dark-muted hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green rounded"
                  >
                    Ja tenho conta
                  </button>
                </div>
              )}

              {/* ── Auth routes (Dex) ────────────────────────── */}
              {route === 'login' && (
                <Login
                  onLogin={() => navigate('dashboard')}
                  onGoSignup={() => navigate('signup')}
                  onGoMagicLink={() => navigate('magic-link')}
                />
              )}
              {route === 'signup' && (
                <Signup
                  onSignup={() => navigate('onboarding')}
                  onGoLogin={() => navigate('login')}
                />
              )}
              {route === 'magic-link' && (
                <MagicLink onGoLogin={() => navigate('login')} />
              )}
              {route === 'onboarding' && (
                <Wizard
                  onComplete={() => navigate('dashboard')}
                  onNavigate={navigate}
                />
              )}

              {/* ── App routes (Uma) ─────────────────────────── */}
              {route === 'dashboard' && (
                <Dashboard onNavigate={navigate} />
              )}

              {/* Integrações — rota canônica /integracoes (antigo /settings/integrations) */}
              {route === 'integracoes' && (
                <Integrations onNavigate={navigate} />
              )}

              {/* Tracking — eventos recentes */}
              {route === 'tracking' && (
                <AppShell activePath={activePath} onNavigate={navigate}>
                  <EmptyState
                    icon={Pulse}
                    title="Nenhum evento recebido ainda"
                    description="Configure uma integração para começar a receber eventos de tracking."
                    action={{ label: 'Configurar integração', onClick: () => navigate('integracoes') }}
                  />
                </AppShell>
              )}

              {/* Conversões */}
              {route === 'conversoes' && (
                <AppShell activePath={activePath} onNavigate={navigate}>
                  <EmptyState
                    icon={Target}
                    title="Nenhuma conversão registrada ainda"
                    description="As conversões aparecerão aqui após a integração com Hotmart, Meta CAPI ou Google Ads."
                    action={{ label: 'Configurar integração', onClick: () => navigate('integracoes') }}
                  />
                </AppShell>
              )}

              {/* Leads */}
              {route === 'leads' && (
                <AppShell activePath={activePath} onNavigate={navigate}>
                  <EmptyState
                    icon={Users}
                    title="Nenhum lead capturado ainda"
                    description="Leads com score e canal de origem aparecerão aqui assim que o tracking estiver ativo."
                    action={{ label: 'Ativar tracking', onClick: () => navigate('integracoes') }}
                  />
                </AppShell>
              )}

              {/* Configurações */}
              {route === 'configuracoes' && (
                <AppShell activePath={activePath} onNavigate={navigate}>
                  <EmptyState
                    icon={Gear}
                    title="Configurações em breve"
                    description="Perfil, time e preferências da conta estarão disponíveis na Era 2."
                  />
                </AppShell>
              )}
            </PromptProvider>
          </ConfirmProvider>
        </ToastProvider>
      </SpotlightProvider>
    </ThemeProvider>
  )
}

export default App
