// InstallFailureState.test.tsx — F-S09 AC-5
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallFailureState } from '../InstallFailureState'

describe('InstallFailureState', () => {
  it('renderiza headline humano + detalhe técnico com errorId em <pre>', () => {
    render(
      <InstallFailureState
        domain="zerohum.com.br"
        errorCode="403 Forbidden"
        errorMessage="Token sem permissão"
        errorId="err_2026-05-25_001"
        suggestions={['Habilite permissão', 'Tente de novo']}
        onAction={() => {}}
      />,
    )
    expect(screen.getByText('Não consegui instalar o tracking')).toBeInTheDocument()
    expect(screen.getByText('zerohum.com.br')).toBeInTheDocument()
    // Detalhe técnico em <pre>
    const pre = screen.getByLabelText('Detalhe técnico do erro')
    expect(pre.textContent).toContain('403 Forbidden')
    expect(pre.textContent).toContain('Token sem permissão')
    expect(pre.textContent).toContain('err_2026-05-25_001')
  })

  it('renderiza lista numerada de sugestões', () => {
    render(
      <InstallFailureState
        domain="x.com"
        errorCode="500"
        errorMessage="boom"
        errorId="err-1"
        suggestions={['Passo um', 'Passo dois', 'Passo três']}
        onAction={() => {}}
      />,
    )
    expect(screen.getByText('Passo um')).toBeInTheDocument()
    expect(screen.getByText('Passo dois')).toBeInTheDocument()
    expect(screen.getByText('Passo três')).toBeInTheDocument()
  })

  it('Copiar ID chama navigator.clipboard.writeText + dispara onAction("copy_id")', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)
    // jsdom navigator.clipboard é getter-only; redefinimos via defineProperty.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(
      <InstallFailureState
        domain="x.com"
        errorCode="500"
        errorMessage="boom"
        errorId="err-abc-123"
        suggestions={[]}
        onAction={onAction}
      />,
    )
    const copyBtn = screen.getByRole('button', { name: /copiar id/i })
    await user.click(copyBtn)
    expect(writeText).toHaveBeenCalledWith('err-abc-123')
    expect(onAction).toHaveBeenCalledWith('copy_id')
  })

  it('CTAs retry/reconnect/cancel disparam actions correspondentes', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <InstallFailureState
        domain="x.com"
        errorCode="500"
        errorMessage="boom"
        errorId="err-1"
        suggestions={[]}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onAction).toHaveBeenCalledWith('retry')
    await user.click(screen.getByRole('button', { name: 'Reconectar Hostinger' }))
    expect(onAction).toHaveBeenCalledWith('reconnect')
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onAction).toHaveBeenCalledWith('cancel')
  })
})
