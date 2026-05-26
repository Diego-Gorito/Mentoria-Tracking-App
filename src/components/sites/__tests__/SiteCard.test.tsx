// SiteCard.test.tsx — F-S09 AC-1
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SiteCard } from '../SiteCard'
import type { EnrichedSite } from '@/types/sites'

const baseInstalled: EnrichedSite = {
  domain: 'colegiomentoria.com.br',
  wp_version: '6.5',
  php_version: '8.2',
  ttfb_ms: 23,
  is_wordpress: true,
  status: 'installed',
  brand_slug: 'mentoria',
  container_id: 'GTM-5J587HS3',
  last_install_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
}

const baseNotInstalled: EnrichedSite = {
  domain: 'zerohum.colegiomentoria.com.br',
  wp_version: '6.4',
  php_version: '8.1',
  ttfb_ms: 41,
  is_wordpress: true,
  status: 'not_installed',
}

const baseUnsupported: EnrichedSite = {
  domain: 'landing.example.com',
  is_wordpress: false,
}

describe('SiteCard', () => {
  it('renderiza site installed com container_id + status badge + ações revalidar/reinstalar', () => {
    const onRevalidate = vi.fn()
    render(
      <SiteCard site={baseInstalled} onRevalidate={onRevalidate} onReinstall={() => {}} onViewDetails={() => {}} />,
    )
    expect(screen.getByText('colegiomentoria.com.br')).toBeInTheDocument()
    expect(screen.getByText(/GTM-5J587HS3/)).toBeInTheDocument()
    // Status accessible label
    const article = screen.getByRole('article')
    expect(article.textContent).toContain('Instalado')
    expect(screen.getByRole('button', { name: 'Revalidar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reinstalar' })).toBeInTheDocument()
  })

  it('clicar Instalar tracking em site not_installed dispara onInstall com brand', async () => {
    const user = userEvent.setup()
    const onInstall = vi.fn()
    // Brand selecionada via prop (component só dispara quando há brand).
    const siteWithBrand: EnrichedSite = { ...baseNotInstalled, brand_slug: 'zerohum' }
    render(<SiteCard site={siteWithBrand} onInstall={onInstall} />)
    const btn = screen.getByRole('button', { name: 'Instalar tracking' })
    expect(btn).not.toBeDisabled()
    await user.click(btn)
    expect(onInstall).toHaveBeenCalledWith(siteWithBrand, 'zerohum')
  })

  it('site não-WP renderiza "Não suportado" sem actions', () => {
    render(<SiteCard site={baseUnsupported} onInstall={() => {}} />)
    const article = screen.getByRole('article')
    expect(article.textContent).toContain('Não suportado')
    expect(screen.queryByRole('button', { name: 'Instalar tracking' })).not.toBeInTheDocument()
  })

  it('Instalar tracking desabilitado quando brand_slug ausente', () => {
    const onInstall = vi.fn()
    render(<SiteCard site={baseNotInstalled} onInstall={onInstall} />)
    const btn = screen.getByRole('button', { name: 'Instalar tracking' })
    expect(btn).toBeDisabled()
  })
})
