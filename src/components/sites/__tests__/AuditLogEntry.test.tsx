// AuditLogEntry.test.tsx — F-S09 AC-8
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditLogEntry } from '../AuditLogEntry'
import type { InstallationAudit } from '@/types/sites'

const baseEntry: InstallationAudit = {
  id: 'aud-1',
  installation_id: 'inst-1',
  tenant_id: 'tenant-1',
  action: 'validation_passed',
  payload: { dataLayer_detected: true, container_id_match: 'GTM-WVWQVMP', extras: { x: 1 } },
  actor_source: 'tracking-api',
  created_at: '2026-05-25T14:32:01.000Z',
}

describe('AuditLogEntry', () => {
  it('renderiza action human label PT-BR + timestamp formatado', () => {
    render(
      <ul>
        <AuditLogEntry entry={baseEntry} />
      </ul>,
    )
    // Action label "Validação OK"
    expect(screen.getAllByText('Validação OK').length).toBeGreaterThan(0)
    // Timestamp em dd/MM/yyyy HH:mm:ss — local TZ-dependent; aceitamos /25\/05\/2026/.
    expect(screen.getByText(/25\/05\/2026/)).toBeInTheDocument()
  })

  it('expand toggle mostra payload completo', async () => {
    const user = userEvent.setup()
    render(
      <ul>
        <AuditLogEntry entry={baseEntry} />
      </ul>,
    )
    const toggle = screen.getByRole('button', { name: /expandir detalhes/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Payload completo em <pre> com indentação 2-space.
    const region = screen.getByRole('region', { name: /detalhes do evento/i })
    expect(region.textContent).toContain('"dataLayer_detected"')
    expect(region.textContent).toContain('"container_id_match"')
  })

  it('abridge payload >80 chars com ellipsis', () => {
    const longEntry: InstallationAudit = {
      ...baseEntry,
      payload: { msg: 'x'.repeat(200) },
    }
    render(
      <ul>
        <AuditLogEntry entry={longEntry} />
      </ul>,
    )
    expect(screen.getByText(/…$/)).toBeInTheDocument()
  })
})
