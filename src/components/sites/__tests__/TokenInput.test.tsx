// TokenInput.test.tsx — F-S09 AC-6
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TokenInput } from '../TokenInput'

describe('TokenInput', () => {
  it('renderiza com type="password" por default + sem placeholder de exemplo', () => {
    render(<TokenInput value="" onChange={() => {}} />)
    const input = screen.getByLabelText('Token API Hostinger') as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.placeholder).toBe('')
  })

  it('toggle eye alterna type entre password e text + aria-pressed', async () => {
    const user = userEvent.setup()
    render(<TokenInput value="abc" onChange={() => {}} />)
    const toggle = screen.getByRole('button', { name: /mostrar token/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    const input = screen.getByLabelText('Token API Hostinger') as HTMLInputElement
    expect(input.type).toBe('text')
    expect(screen.getByRole('button', { name: /ocultar token/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('exibe mensagem de erro + aria-invalid quando error prop set', () => {
    render(<TokenInput value="" onChange={() => {}} error="Token muito curto" />)
    const input = screen.getByLabelText('Token API Hostinger')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Token muito curto')
  })

  it('chama onChange ao digitar', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TokenInput value="" onChange={onChange} />)
    const input = screen.getByLabelText('Token API Hostinger')
    await user.type(input, 'x')
    expect(onChange).toHaveBeenCalled()
  })
})
