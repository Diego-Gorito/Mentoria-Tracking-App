// InstallProgressModal.test.tsx — F-S09 AC-3
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InstallProgressModal } from '../InstallProgressModal'
import type { InstallStep } from '@/types/sites'

const STEPS_RUNNING: InstallStep[] = [
  { label: 'Conectando com Hostinger', status: 'done', durationMs: 3200 },
  { label: 'Instalando plugin GTM4WP', status: 'in_progress' },
  { label: 'Validando dataLayer', status: 'pending' },
  { label: 'Registrando audit log', status: 'pending' },
]

const STEPS_ALL_PENDING: InstallStep[] = STEPS_RUNNING.map((s) => ({ ...s, status: 'pending' }))

describe('InstallProgressModal', () => {
  it('não renderiza quando isOpen=false', () => {
    render(<InstallProgressModal isOpen={false} steps={STEPS_RUNNING} currentStep={1} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renderiza com role=dialog aria-modal aria-busy + 4 steps + progress bar', () => {
    render(<InstallProgressModal isOpen={true} steps={STEPS_RUNNING} currentStep={1} domain="x.com" />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Instalando tracking…')).toBeInTheDocument()
    expect(screen.getByText('x.com')).toBeInTheDocument()
    expect(screen.getByText('Conectando com Hostinger')).toBeInTheDocument()
    expect(screen.getByText('Instalando plugin GTM4WP')).toBeInTheDocument()
    expect(screen.getByText('Validando dataLayer')).toBeInTheDocument()
    expect(screen.getByText('Registrando audit log')).toBeInTheDocument()
    // Tempo gasto mostrado pra step done.
    expect(screen.getByText('3.2s')).toBeInTheDocument()
    // Progress bar com aria-valuenow = 1/4 = 25%
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '25')
  })

  it('mostra botão "Fechar" emergency apenas quando hasFailed=true', () => {
    const onForceClose = vi.fn()
    const { rerender } = render(
      <InstallProgressModal
        isOpen={true}
        steps={STEPS_ALL_PENDING}
        currentStep={0}
        hasFailed={false}
        onForceClose={onForceClose}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Fechar' })).not.toBeInTheDocument()

    rerender(
      <InstallProgressModal
        isOpen={true}
        steps={STEPS_ALL_PENDING}
        currentStep={0}
        hasFailed={true}
        onForceClose={onForceClose}
      />,
    )
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })
})
