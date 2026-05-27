// SitesListPageContainer.test.tsx — Codex adversarial #4 fix integration test
//
// Codex #4 finding [critical]: rota /sites renderizava SitesListPage sem
// `onInstallSite`, então botão "Instalar tracking" nunca aparecia — install
// flow era dead code. Container wrappa SitesListPage com callbacks reais.
//
// Esses tests validam o fix:
//  1. Site WP not_installed mostra botão "Instalar tracking"
//  2. Click no botão dispara `useInstallTracking.start` com (brand, ctx)
//  3. Site uploaded_pending_activation mostra CTA "Já ativei, validar agora"

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

import { SitesListPageContainer } from '../SitesListPageContainer'
import type { EnrichedSite } from '@/types/sites'
import type { HostingAccount } from '@/types/hosting'
import { ThemeProvider } from '@/lib/theme'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('@/hooks/useSites', () => ({
  useSites: vi.fn(),
}))
vi.mock('@/hooks/useHostingerAccount', () => ({
  useHostingerAccount: vi.fn(),
}))
vi.mock('@/hooks/useInstallTracking', () => ({
  useInstallTracking: vi.fn(),
}))
vi.mock('@/lib/sitesApi', () => ({
  apiFetch: vi.fn(),
}))

import { useSites } from '@/hooks/useSites'
import { useHostingerAccount } from '@/hooks/useHostingerAccount'
import { useInstallTracking } from '@/hooks/useInstallTracking'
import { apiFetch } from '@/lib/sitesApi'

const mockedUseSites = vi.mocked(useSites)
const mockedUseHostingerAccount = vi.mocked(useHostingerAccount)
const mockedUseInstallTracking = vi.mocked(useInstallTracking)
const mockedApiFetch = vi.mocked(apiFetch)

function renderWithProviders(ui: ReactNode) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  )
}

const account: HostingAccount = {
  id: 'acc-1',
  provider: 'hostinger',
  account_label: 'Pessoal',
  status: 'active',
  created_at: '2026-05-25T00:00:00Z',
  updated_at: '2026-05-25T00:00:00Z',
}

const siteNotInstalled: EnrichedSite = {
  domain: 'zerohum.com.br',
  is_wordpress: true,
  wp_version: '6.5',
  php_version: '8.2',
  ttfb_ms: 28,
  status: 'not_installed',
  brand_slug: 'zerohum',
  hosting_account_id: 'acc-1',
}

const sitePendingActivation: EnrichedSite = {
  domain: 'zerohum.com.br',
  is_wordpress: true,
  wp_version: '6.5',
  php_version: '8.2',
  ttfb_ms: 28,
  status: 'uploaded_pending_activation',
  brand_slug: 'zerohum',
  installation_id: 'inst-pending-1',
  hosting_account_id: 'acc-1',
}

beforeEach(() => {
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
    sites: [siteNotInstalled],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })
  mockedUseHostingerAccount.mockReturnValue({
    account,
    isConnected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    connectError: null,
  })
  mockedUseInstallTracking.mockReturnValue({
    install: null,
    progress: { step: 'idle', status: 'in_progress' },
    status: 'idle',
    result: null,
    start: vi.fn().mockResolvedValue(undefined),
    setSiteContext: vi.fn(),
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('SitesListPageContainer — Codex #4 wire onInstallSite', () => {
  it('site WP not_installed mostra botão "Instalar tracking" (fix critical)', () => {
    renderWithProviders(<SitesListPageContainer />)

    // Botão Install só aparece se onInstall foi passado pelo container.
    // Antes do fix Codex #4, SitesListPage era renderizada sem onInstallSite,
    // então o botão NÃO existia — fluxo morto. Esse test ancora a regression.
    expect(
      screen.getByRole('button', { name: /Instalar tracking/i }),
    ).toBeInTheDocument()
  })

  it('clicar "Instalar tracking" dispara useInstallTracking.start com brand+ctx', async () => {
    const startSpy = vi.fn().mockResolvedValue(undefined)
    mockedUseInstallTracking.mockReturnValue({
      install: null,
      progress: { step: 'idle', status: 'in_progress' },
      status: 'idle',
      result: null,
      start: startSpy,
      setSiteContext: vi.fn(),
    })

    const user = userEvent.setup()
    renderWithProviders(<SitesListPageContainer />)

    await user.click(screen.getByRole('button', { name: /Instalar tracking/i }))

    // Container mounta InstallFlow que dispara start no useEffect.
    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledWith('zerohum', {
        hostingAccountId: 'acc-1',
        siteDomain: 'zerohum.com.br',
      })
    })
  })

  it('site uploaded_pending_activation mostra CTA "Já ativei, validar agora"', () => {
    mockedUseSites.mockReturnValue({
      sites: [sitePendingActivation],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    renderWithProviders(<SitesListPageContainer />)

    expect(
      screen.getByRole('button', { name: /Já ativei, validar agora/i }),
    ).toBeInTheDocument()
    // Mensagem instrucional explica o passo manual.
    expect(screen.getByText(/Plugin enviado/i)).toBeInTheDocument()
  })

  it('clicar "Já ativei, validar agora" no card dispara POST /:id/revalidate', async () => {
    mockedUseSites.mockReturnValue({
      sites: [sitePendingActivation],
      isLoading: false,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
    })
    mockedApiFetch.mockResolvedValueOnce({ data: { passed: true, stage: 'full' } })

    const user = userEvent.setup()
    renderWithProviders(<SitesListPageContainer />)

    await user.click(
      screen.getByRole('button', { name: /Já ativei, validar agora/i }),
    )

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/api/installations/inst-pending-1/revalidate',
        { method: 'POST' },
      )
    })
  })
})
