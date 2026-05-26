// InstallSuccessState.test.tsx — F-S09 AC-4
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallSuccessState } from '../InstallSuccessState'

describe('InstallSuccessState', () => {
  it('renderiza headline + domain + container + 4 checklist items + duração', () => {
    render(
      <InstallSuccessState
        domain="zerohum.com.br"
        containerId="GTM-WVWQVMP"
        brandSlug="zerohum"
        durationSec={28}
        onAction={() => {}}
      />,
    )
    expect(screen.getByText('Tracking instalado com sucesso!')).toBeInTheDocument()
    expect(screen.getByText('zerohum.com.br')).toBeInTheDocument()
    expect(screen.getByText('GTM-WVWQVMP')).toBeInTheDocument()
    expect(screen.getByText('Plugin GTM4WP ativo')).toBeInTheDocument()
    expect(screen.getByText('dataLayer detectado no DOM')).toBeInTheDocument()
    expect(screen.getByText('Container ID configurado corretamente')).toBeInTheDocument()
    expect(screen.getByText('Audit log registrado')).toBeInTheDocument()
    expect(screen.getByText(/Tempo total: 28 segundos/)).toBeInTheDocument()
  })

  it('renderiza 4 CTAs + dispara onAction com identifier correto', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <InstallSuccessState
        domain="x.com"
        containerId="GTM-X"
        durationSec={10}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByRole('button', { name: /abrir site/i }))
    expect(onAction).toHaveBeenCalledWith('open_site')
    await user.click(screen.getByRole('button', { name: 'Ver audit log' }))
    expect(onAction).toHaveBeenCalledWith('view_audit')
    await user.click(screen.getByRole('button', { name: 'Instalar em outro site' }))
    expect(onAction).toHaveBeenCalledWith('install_another')
    await user.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    expect(onAction).toHaveBeenCalledWith('back_to_list')
  })

  it('NÃO renderiza confetti (UX-008) — apenas checkmark estático/animado', () => {
    const { container } = render(
      <InstallSuccessState
        domain="x.com"
        containerId="GTM-X"
        durationSec={10}
        onAction={() => {}}
      />,
    )
    // sem elemento canvas/svg de confetti
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('[data-confetti]')).toBeNull()
  })
})
