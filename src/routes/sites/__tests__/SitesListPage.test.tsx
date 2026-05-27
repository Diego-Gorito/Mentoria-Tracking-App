// SitesListPage.test.tsx — F-S10 AC-1 cobertura mínima
// Smoke tests focados nos dois ramos críticos:
//   1) sem account → empty state "Conecte sua Hostinger" + CTA
//   2) com account + sites → lista de SiteCards (1 por site)
//
// Hooks mockados (useSites, useHostingerAccount) — evita stubGlobal('fetch')
// e mantém escopo de teste à composição de pages F-S10.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SitesListPage } from '../SitesListPage'
import type { EnrichedSite } from '@/types/sites'
import type { HostingAccount } from '@/types/hosting'
import { ThemeProvider } from '@/lib/theme'

// Mocks de módulo — alteramos return value por test via mockReturnValue.
vi.mock('@/hooks/useSites', () => ({
  useSites: vi.fn(),
}))
vi.mock('@/hooks/useHostingerAccount', () => ({
  useHostingerAccount: vi.fn(),
}))

import { useSites } from '@/hooks/useSites'
import { useHostingerAccount } from '@/hooks/useHostingerAccount'

// Wrapper de render — Topbar (dentro de AppShell) usa useTheme, então
// precisamos do ThemeProvider mesmo nos smoke tests.
function renderWithProviders(ui: ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

const mockedUseSites = vi.mocked(useSites)
const mockedUseHostingerAccount = vi.mocked(useHostingerAccount)

const account: HostingAccount = {
  id: 'acc-1',
  provider: 'hostinger',
  account_label: 'Pessoal',
  status: 'active',
  created_at: '2026-05-25T00:00:00Z',
  updated_at: '2026-05-25T00:00:00Z',
}

const siteInstalled: EnrichedSite = {
  domain: 'colegiomentoria.com.br',
  is_wordpress: true,
  wp_version: '6.5',
  php_version: '8.2',
  ttfb_ms: 28,
  status: 'installed',
  brand_slug: 'mentoria',
  container_id: 'GTM-5J587HS3',
  installation_id: 'inst-1',
  hosting_account_id: 'acc-1',
}

beforeEach(() => {
  // AppShell consome window.matchMedia pra reduced-motion guard.
  // jsdom não implementa — stub no-op evita TypeError no useEffect.
  if (!window.matchMedia) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  }

  mockedUseSites.mockReturnValue({
    sites: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })
  mockedUseHostingerAccount.mockReturnValue({
    account: null,
    isConnected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    connectError: null,
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('SitesListPage (F-S10 AC-1)', () => {
  it('renderiza empty state "Conecte sua Hostinger" quando sem account', () => {
    renderWithProviders(<SitesListPage />)
    // Headline + descrição
    expect(screen.getByText(/Conecte sua Hostinger pra começar/i)).toBeInTheDocument()
    // CTA "Conectar via Hostinger"
    expect(screen.getByRole('button', { name: /Conectar via Hostinger/i })).toBeInTheDocument()
  })

  it('clicar CTA "Conectar via Hostinger" chama onNavigate("sites/connect")', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    renderWithProviders(<SitesListPage onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: /Conectar via Hostinger/i }))
    expect(onNavigate).toHaveBeenCalledWith('sites/connect')
  })

  it('com account conectada + sites carregados, renderiza header + lista de cards', () => {
    mockedUseHostingerAccount.mockReturnValue({
      account,
      isConnected: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnecting: false,
      connectError: null,
    })
    mockedUseSites.mockReturnValue({
      sites: [siteInstalled],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    renderWithProviders(<SitesListPage />)
    // Heading da page
    expect(
      screen.getByRole('heading', { name: /Sites Conectados/i, level: 1 }),
    ).toBeInTheDocument()
    // Apelido da account no subtítulo
    expect(screen.getByText(/Pessoal/)).toBeInTheDocument()
    // Site renderizado via SiteCard
    expect(screen.getByText('colegiomentoria.com.br')).toBeInTheDocument()
    // KPI "Sites conectados" mostra contagem
    expect(screen.getByText('Sites conectados')).toBeInTheDocument()
  })
})
