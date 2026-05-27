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
import { GtmContainerPage } from '@/routes/settings/GtmContainerPage'
import { LeadsList } from '@/routes/leads/LeadsList'
import { LeadDetail } from '@/routes/leads/LeadDetail'
// Sites routes (F-S10) — auto-provisioner GTM Hostinger
// Container wraps SitesListPage com install flow real (Codex #4 fix 2026-05-27).
import { SitesListPageContainer } from '@/routes/sites/SitesListPageContainer'
import { ConnectHostingerPage } from '@/routes/sites/ConnectHostingerPage'
import { SiteDetailPage } from '@/routes/sites/SiteDetailPage'
import { SiteAuditLogPage } from '@/routes/sites/SiteAuditLogPage'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Pulse, Target, Gear } from '@phosphor-icons/react'

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
  | 'sites'
  | 'configuracoes'

/**
 * Sub-state da rota 'sites' (F-S10).
 *
 * Decisão arquitetural: state machine única (`sitesSubpage` enum) em vez de
 * 4 estados booleanos. Razão: rotas /sites/*  são mutuamente exclusivas e
 * deep-link parsing mapeia 1:1 ao enum. Espelha o pattern do `selectedLeadId`
 * mas mais expressivo (4 destinos vs binário list/detail).
 *
 * - 'list'    → /sites
 * - 'connect' → /sites/connect
 * - 'detail'  → /sites/:siteId
 * - 'logs'    → /sites/:siteId/logs
 */
type SitesSubpage = 'list' | 'connect' | 'detail' | 'logs'

/** Parse pathname /sites* em { subpage, siteId? }. */
function parseSitesPath(pathname: string): { subpage: SitesSubpage; siteId: string | null } {
  // /sites
  if (pathname === '/sites' || pathname === '/sites/') {
    return { subpage: 'list', siteId: null }
  }
  // /sites/connect
  if (pathname === '/sites/connect' || pathname === '/sites/connect/') {
    return { subpage: 'connect', siteId: null }
  }
  // /sites/:id/logs
  const logsMatch = pathname.match(/^\/sites\/([^/]+)\/logs\/?$/)
  if (logsMatch) {
    return { subpage: 'logs', siteId: decodeURIComponent(logsMatch[1]) }
  }
  // /sites/:id
  const detailMatch = pathname.match(/^\/sites\/([^/]+)\/?$/)
  if (detailMatch) {
    return { subpage: 'detail', siteId: decodeURIComponent(detailMatch[1]) }
  }
  return { subpage: 'list', siteId: null }
}

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
  if (path.startsWith('/sites')) return 'sites'
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
  'sites',
  'configuracoes',
]

export function App() {
  const [route, setRoute] = useState<Route>(resolveInitialRoute)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  // F-S10 — sub-state da rota 'sites' (list/connect/detail/logs + siteId opcional).
  // Inicializa parseando o pathname atual pra suportar deep-link/refresh.
  const [sitesState, setSitesState] = useState<{
    subpage: SitesSubpage
    siteId: string | null
  }>(() => parseSitesPath(window.location.pathname))

  function navigate(href: string) {
    const cleanWithQs = href.replace(/^\//, '')
    const clean = cleanWithQs.split('?')[0]
    // Match exato OU prefix `<route>/...`. Pega o match mais longo pra evitar
    // ambiguidade (ex: 'sites' deve casar 'sites/connect' antes de 'site...').
    const matches = VALID_ROUTES.filter((r) => clean === r || clean.startsWith(r + '/'))
    const matched = matches.sort((a, b) => b.length - a.length)[0]
    const target = (matched ?? 'dashboard') as Route
    setRoute(target)

    // F-S10 — atualizar sub-state ao navegar pra 'sites/*'.
    if (target === 'sites') {
      setSitesState(parseSitesPath('/' + clean))
    }

    window.history.pushState({}, '', '/' + cleanWithQs)
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
    sites: '/sites',
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
                window.location.pathname.startsWith('/integracoes/gtm') ? (
                  <GtmContainerPage onNavigate={navigate} />
                ) : (
                  <Integrations onNavigate={navigate} />
                )
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

              {/* Leads — lista + detalhe */}
              {route === 'leads' && !selectedLeadId && (
                <LeadsList
                  onNavigate={navigate}
                  onSelectLead={(id) => {
                    setSelectedLeadId(id)
                    window.history.pushState({}, '', `/leads/${id}`)
                  }}
                />
              )}
              {route === 'leads' && selectedLeadId && (
                <LeadDetail
                  leadId={selectedLeadId}
                  onNavigate={navigate}
                  onBack={() => {
                    setSelectedLeadId(null)
                    window.history.pushState({}, '', '/leads')
                  }}
                />
              )}

              {/* Sites (F-S10) — lista / connect / detalhe / logs.
                  Auth guard implícito: resolveInitialRoute() acima já força
                  'login' se !isAuthenticated, então 'sites' só renderiza
                  com sessão válida (AC-7). */}
              {route === 'sites' && sitesState.subpage === 'list' && (
                <SitesListPageContainer
                  onNavigate={navigate}
                  onViewSiteDetails={(site) => {
                    const id = site.installation_id ?? site.domain
                    setSitesState({ subpage: 'detail', siteId: id })
                    window.history.pushState({}, '', `/sites/${encodeURIComponent(id)}`)
                  }}
                />
              )}
              {route === 'sites' && sitesState.subpage === 'connect' && (
                <ConnectHostingerPage
                  onNavigate={navigate}
                  onCancel={() => {
                    setSitesState({ subpage: 'list', siteId: null })
                    window.history.pushState({}, '', '/sites')
                  }}
                />
              )}
              {route === 'sites' && sitesState.subpage === 'detail' && sitesState.siteId && (
                <SiteDetailPage
                  siteId={sitesState.siteId}
                  onNavigate={navigate}
                  onBack={() => {
                    setSitesState({ subpage: 'list', siteId: null })
                    window.history.pushState({}, '', '/sites')
                  }}
                />
              )}
              {route === 'sites' && sitesState.subpage === 'logs' && sitesState.siteId && (
                <SiteAuditLogPage
                  siteId={sitesState.siteId}
                  onNavigate={navigate}
                  onBack={() => {
                    const id = sitesState.siteId as string
                    setSitesState({ subpage: 'detail', siteId: id })
                    window.history.pushState({}, '', `/sites/${encodeURIComponent(id)}`)
                  }}
                />
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
