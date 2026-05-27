// ConnectHostingerPage.test.tsx — F-S10 AC-2 cobertura mínima
// Smoke tests focados em:
//   1) render form com TokenInput + HostingerHelpAccordion + CTAs
//   2) submit válido chama useHostingerAccount.connect(token, label, wpAdminPass)
//
// Hooks mockados (useHostingerAccount) — evita stub global fetch.
// Toast provider envolve render pois ConnectHostingerPage chama useToast.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectHostingerPage } from '../ConnectHostingerPage'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider } from '@/lib/theme'

vi.mock('@/hooks/useHostingerAccount', () => ({
  useHostingerAccount: vi.fn(),
}))

import { useHostingerAccount } from '@/hooks/useHostingerAccount'
const mockedUseHostingerAccount = vi.mocked(useHostingerAccount)

let mockConnect: ReturnType<typeof vi.fn>

beforeEach(() => {
  // AppShell consome window.matchMedia (não implementado por jsdom).
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

  mockConnect = vi.fn().mockResolvedValue(undefined)
  mockedUseHostingerAccount.mockReturnValue({
    account: null,
    isConnected: false,
    connect: mockConnect,
    disconnect: vi.fn(),
    isConnecting: false,
    connectError: null,
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function renderPage(onNavigate: () => void = vi.fn()) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ConnectHostingerPage onNavigate={onNavigate} />
      </ToastProvider>
    </ThemeProvider>,
  )
}

describe('ConnectHostingerPage (F-S10 AC-2)', () => {
  it('renderiza heading + accordion + TokenInput + CTAs', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: /Conectar Hostinger/i, level: 1 }),
    ).toBeInTheDocument()
    // Accordion default-open: texto dos passos visível
    expect(screen.getByText(/Como obter seu token Hostinger/i)).toBeInTheDocument()
    // Field opcional apelido
    expect(screen.getByLabelText(/Apelido \(opcional\)/i)).toBeInTheDocument()
    // TokenInput
    expect(screen.getByLabelText('Token API Hostinger')).toBeInTheDocument()
    // Field opcional senha WP
    expect(screen.getByLabelText(/Senha admin WordPress/i)).toBeInTheDocument()
    // CTAs
    expect(screen.getByRole('button', { name: /Validar e conectar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancelar/i })).toBeInTheDocument()
  })

  it('submit válido chama useHostingerAccount.connect com (token, label, senha)', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    renderPage(onNavigate)

    await user.type(screen.getByLabelText(/Apelido \(opcional\)/i), 'Conta Pessoal')
    await user.type(screen.getByLabelText('Token API Hostinger'), 'abcdef123456789')
    await user.type(screen.getByLabelText(/Senha admin WordPress/i), 'super-secret')

    await user.click(screen.getByRole('button', { name: /Validar e conectar/i }))

    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(mockConnect).toHaveBeenCalledWith(
      'abcdef123456789',
      'Conta Pessoal',
      'super-secret',
    )
    // Após sucesso, navega pra '/sites'.
    expect(onNavigate).toHaveBeenCalledWith('sites')
  })

  it('submit com token vazio mostra erro inline e NÃO chama connect()', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Validar e conectar/i }))

    expect(mockConnect).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/Cole seu token/i)
  })

  it('submit com token muito curto mostra erro inline e NÃO chama connect()', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Token API Hostinger'), 'short')
    await user.click(screen.getByRole('button', { name: /Validar e conectar/i }))

    expect(mockConnect).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/curto demais/i)
  })
})
