// SitesComponentsDemo.tsx — F-S09 AC-10
// Demo page mostrando cada um dos 8 components em todos estados.
// Não é wirada no App.tsx (per spec — agente documenta acesso).
// Pra inspeção visual: importar + renderizar em rota dev OU usar como JSX fixture.
// UX ref: docs/ux-auto-provisioner-gtm-flow.md §3 + §10.

import { useState } from 'react'
import { SiteCard } from '@/components/sites/SiteCard'
import { BrandSelect } from '@/components/sites/BrandSelect'
import { InstallProgressModal } from '@/components/sites/InstallProgressModal'
import { InstallSuccessState } from '@/components/sites/InstallSuccessState'
import { InstallFailureState } from '@/components/sites/InstallFailureState'
import { TokenInput } from '@/components/sites/TokenInput'
import { HostingerHelpAccordion } from '@/components/sites/HostingerHelpAccordion'
import { AuditLogEntry } from '@/components/sites/AuditLogEntry'
import { Button } from '@/components/ui/Button'
import type { BrandSlug, EnrichedSite, InstallationAudit, InstallStep } from '@/types/sites'

const FAKE_SITES: EnrichedSite[] = [
  {
    domain: 'colegiomentoria.com.br',
    wp_version: '6.5',
    php_version: '8.2',
    ttfb_ms: 23,
    is_wordpress: true,
    status: 'installed',
    brand_slug: 'mentoria',
    container_id: 'GTM-5J587HS3',
    last_install_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    domain: 'ifrn-preparatorio.com.br',
    wp_version: '5.9',
    php_version: '7.4',
    ttfb_ms: 156,
    is_wordpress: true,
    status: 'drift_detected',
    brand_slug: 'ifrn',
    container_id: 'GTM-5J587HS3',
    last_install_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
  },
  {
    domain: 'algo-falhou.example.com',
    wp_version: '6.4',
    php_version: '8.1',
    ttfb_ms: 92,
    is_wordpress: true,
    status: 'failed',
    brand_slug: 'zerohum',
  },
  {
    domain: 'zerohum.colegiomentoria.com.br',
    wp_version: '6.4',
    php_version: '8.1',
    ttfb_ms: 41,
    is_wordpress: true,
    status: 'not_installed',
  },
  {
    domain: 'landing-experimento-2024.com.br',
    is_wordpress: false,
  },
]

const FAKE_AUDITS: InstallationAudit[] = [
  {
    id: 'aud-1',
    installation_id: 'inst-1',
    tenant_id: 'tenant-1',
    action: 'upload_started',
    payload: { domain: 'zerohum.com.br', file_count: 23 },
    actor_source: 'tracking-api',
    created_at: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: 'aud-2',
    installation_id: 'inst-1',
    tenant_id: 'tenant-1',
    action: 'validation_passed',
    payload: {
      dataLayer_detected: true,
      container_id_match: 'GTM-WVWQVMP',
      checks_run: 5,
      latency_ms: 850,
      extras: { plugin_version: '1.0.4', wp_version: '6.5' },
    },
    actor_source: 'tracking-api',
    created_at: new Date(Date.now() - 30_000).toISOString(),
  },
  {
    id: 'aud-3',
    installation_id: 'inst-1',
    tenant_id: 'tenant-1',
    action: 'upload_failed',
    payload: { error: '403 Forbidden', retries: 3 },
    actor_source: 'tracking-api',
    created_at: new Date(Date.now() - 5_000).toISOString(),
  },
]

const PROGRESS_STEPS_RUNNING: InstallStep[] = [
  { label: 'Conectando com Hostinger', status: 'done', durationMs: 3200 },
  { label: 'Instalando plugin GTM4WP', status: 'in_progress' },
  { label: 'Validando dataLayer', status: 'pending' },
  { label: 'Registrando audit log', status: 'pending' },
]

const PROGRESS_STEPS_FAILED: InstallStep[] = [
  { label: 'Conectando com Hostinger', status: 'done', durationMs: 3200 },
  { label: 'Instalando plugin GTM4WP', status: 'failed' },
  { label: 'Validando dataLayer', status: 'pending' },
  { label: 'Registrando audit log', status: 'pending' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border-default pb-10 mb-10">
      <h2 className="text-h2 font-semibold text-brand-black mb-2">{title}</h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  )
}

function Variant({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-fg-on-light-muted font-medium uppercase tracking-wide">
        {label}
      </span>
      <div className="border border-border-subtle rounded-lg p-4 bg-bg-content">{children}</div>
    </div>
  )
}

export function SitesComponentsDemo() {
  const [brandValue, setBrandValue] = useState<BrandSlug | undefined>(undefined)
  const [tokenEmpty, setTokenEmpty] = useState('')
  const [tokenFilled, setTokenFilled] = useState('abc123example-token-do-not-share')
  const [tokenError, setTokenError] = useState('bad')
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressFailed, setProgressFailed] = useState(false)

  return (
    <div className="min-h-screen bg-white px-6 py-10 max-w-5xl mx-auto">
      <header className="mb-10">
        <h1 className="text-display-md text-brand-black mb-2">/dev/sites-demo</h1>
        <p className="text-body-md text-fg-on-light-muted">
          F-S09 — 8 components frontend Vite (Sites Conectados). Cada section abaixo cobre 1
          component em seus estados visíveis. Ref: docs/stories/F-S09.md + ux §10.
        </p>
      </header>

      <Section title="SiteCard — 4 status">
        {FAKE_SITES.map((site) => (
          <SiteCard
            key={site.domain}
            site={site}
            onInstall={(s, b) => console.info('install', s.domain, b)}
            onRevalidate={(s) => console.info('revalidate', s.domain)}
            onReinstall={(s) => console.info('reinstall', s.domain)}
            onViewDetails={(s) => console.info('details', s.domain)}
            onBrandChange={(s, b) => console.info('brand', s.domain, b)}
          />
        ))}
      </Section>

      <Section title="BrandSelect">
        <Variant label="default (sem valor)">
          <BrandSelect value={brandValue} onChange={setBrandValue} />
          <p className="mt-2 text-caption text-fg-on-light-muted">Atual: {brandValue ?? '—'}</p>
        </Variant>
        <Variant label="disabled (pós-install)">
          <BrandSelect value="mentoria" onChange={() => {}} disabled />
        </Variant>
      </Section>

      <Section title="TokenInput">
        <Variant label="empty">
          <TokenInput value={tokenEmpty} onChange={setTokenEmpty} />
        </Variant>
        <Variant label="filled (toggle eye visibility)">
          <TokenInput value={tokenFilled} onChange={setTokenFilled} />
        </Variant>
        <Variant label="error state">
          <TokenInput
            value={tokenError}
            onChange={setTokenError}
            error="Token muito curto — verifique se copiou o valor completo"
          />
        </Variant>
      </Section>

      <Section title="HostingerHelpAccordion">
        <Variant label="default open (primeira visita)">
          <HostingerHelpAccordion defaultOpen={true} />
        </Variant>
        <Variant label="closed">
          <HostingerHelpAccordion defaultOpen={false} />
        </Variant>
      </Section>

      <Section title="InstallProgressModal">
        <Variant label="trigger modal (Esc disabled)">
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setProgressFailed(false)
                setProgressOpen(true)
              }}
            >
              Abrir progress (running)
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setProgressFailed(true)
                setProgressOpen(true)
              }}
            >
              Abrir progress (failed)
            </Button>
          </div>
        </Variant>
        <InstallProgressModal
          isOpen={progressOpen}
          steps={progressFailed ? PROGRESS_STEPS_FAILED : PROGRESS_STEPS_RUNNING}
          currentStep={1}
          domain="zerohum.colegiomentoria.com.br"
          hasFailed={progressFailed}
          onForceClose={() => setProgressOpen(false)}
        />
      </Section>

      <Section title="InstallSuccessState">
        <InstallSuccessState
          domain="zerohum.colegiomentoria.com.br"
          containerId="GTM-WVWQVMP"
          brandSlug="zerohum"
          durationSec={28}
          onAction={(a) => console.info('success-action', a)}
        />
      </Section>

      <Section title="InstallFailureState">
        <InstallFailureState
          domain="zerohum.colegiomentoria.com.br"
          errorCode="403 Forbidden"
          errorMessage="Hostinger API retornou 403 Forbidden ao instalar o plugin. Provável causa: token sem permissão wordpress.plugins.write."
          errorId="err_2026-05-25_001"
          suggestions={[
            'Verifique se seu token tem permissão de escrita em plugins WordPress no hPanel.',
            'Gere um novo token se necessário e reconecte a conta.',
            'Tente instalar de novo após reconectar.',
          ]}
          onAction={(a) => console.info('failure-action', a)}
          onCopySuccess={() => console.info('toast: ID do erro copiado')}
        />
      </Section>

      <Section title="AuditLogEntry">
        <ul className="border border-border-subtle rounded-lg overflow-hidden bg-white">
          {FAKE_AUDITS.map((entry) => (
            <AuditLogEntry key={entry.id} entry={entry} />
          ))}
        </ul>
      </Section>
    </div>
  )
}

export default SitesComponentsDemo
