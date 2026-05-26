// HostingerHelpAccordion.test.tsx — F-S09 AC-7
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostingerHelpAccordion } from '../HostingerHelpAccordion'

describe('HostingerHelpAccordion', () => {
  it('renderiza fechado quando defaultOpen=false', () => {
    render(<HostingerHelpAccordion defaultOpen={false} />)
    const summary = screen.getByText('Como obter seu token Hostinger?')
    expect(summary).toBeInTheDocument()
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
  })

  it('renderiza aberto por default + 4 passos + link hPanel target=_blank', () => {
    render(<HostingerHelpAccordion />)
    const details = screen.getByText('Como obter seu token Hostinger?').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(true)
    expect(screen.getByText(/Acesse hpanel.hostinger.com/i)).toBeInTheDocument()
    expect(screen.getByText(/Vá em Conta → Acesso API/i)).toBeInTheDocument()
    expect(screen.getByText(/Clique "Gerar token"/i)).toBeInTheDocument()
    expect(screen.getByText(/Cole abaixo/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /abrir hpanel/i }) as HTMLAnchorElement
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
  })

  it('toggle abre/fecha via click no summary', async () => {
    const user = userEvent.setup()
    render(<HostingerHelpAccordion defaultOpen={false} />)
    const summary = screen.getByText('Como obter seu token Hostinger?')
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    await user.click(summary)
    expect(details.open).toBe(true)
  })
})
