// BrandSelect.test.tsx — F-S09 AC-2
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrandSelect } from '../BrandSelect'

describe('BrandSelect', () => {
  it('renderiza 4 brand options + placeholder', () => {
    render(<BrandSelect onChange={() => {}} />)
    const select = screen.getByRole('combobox', { name: /brand/i })
    expect(select).toBeInTheDocument()
    // 4 brand options + 1 placeholder.
    expect(screen.getByRole('option', { name: 'Colégio Mentoria' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Mentoria APP' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Colégio Zerohum' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Blog IFRN' })).toBeInTheDocument()
  })

  it('dispara onChange com o slug ao selecionar', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<BrandSelect onChange={onChange} />)
    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'zerohum')
    expect(onChange).toHaveBeenCalledWith('zerohum')
  })

  it('aplica disabled e mantém label sr-only', () => {
    render(<BrandSelect value="mentoria" onChange={() => {}} disabled />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select).toBeDisabled()
    expect(select.value).toBe('mentoria')
  })
})
