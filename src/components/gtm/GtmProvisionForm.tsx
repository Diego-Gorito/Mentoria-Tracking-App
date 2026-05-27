/**
 * GtmProvisionForm — Form Pixel IDs + Provision button.
 *
 * 16 plataformas suportadas (ADR-0009 §3.6). Diego pode deixar campos vazios
 * — vars [CT] ficam com placeholder PIXEL_NAO_DEFINIDO e tags paused.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import type { PlatformKey, ProvisionPayload } from '@/hooks/useGtmContainer'

interface Props {
  tenantSlug: string
  onProvision: (payload: ProvisionPayload) => Promise<unknown>
  disabled?: boolean
}

interface PlatformField {
  key: PlatformKey
  label: string
  placeholder: string
  helper?: string
}

const PLATFORMS: PlatformField[] = [
  { key: 'meta', label: 'Meta (Facebook) Pixel ID', placeholder: '1234567890123456', helper: '16 dígitos do Pixel Manager' },
  { key: 'ga4_web', label: 'GA4 Measurement ID (web)', placeholder: 'G-XXXXXXXXXX' },
  { key: 'ga4_server', label: 'GA4 Measurement ID (server)', placeholder: 'G-XXXXXXXXXX', helper: 'Opcional, pra Server CAPI' },
  { key: 'bing', label: 'Bing UET Tag ID', placeholder: '12345678' },
  { key: 'x', label: 'X (Twitter) Ads Pixel ID', placeholder: 'o6lxx' },
  { key: 'reddit', label: 'Reddit Pixel ID', placeholder: 't2_abc123' },
  { key: 'pinterest', label: 'Pinterest Tag ID', placeholder: '2612345678901' },
  { key: 'snap', label: 'Snap Pixel ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  { key: 'quora', label: 'Quora Pixel ID', placeholder: 'abc123' },
  { key: 'clarity', label: 'Microsoft Clarity Project ID', placeholder: 'xxxxxxxxxx' },
  { key: 'tiktok', label: 'TikTok Pixel ID', placeholder: 'CXXXXX' },
  { key: 'linkedin', label: 'LinkedIn Insight Tag ID', placeholder: '1234567' },
  { key: 'taboola', label: 'Taboola Pixel ID', placeholder: '1234567' },
  { key: 'outbrain', label: 'Outbrain Pixel ID', placeholder: '00abc...' },
  { key: 'google_ads_conversion', label: 'Google Ads Conversion ID', placeholder: 'AW-1234567890' },
  { key: 'google_ads_remarketing', label: 'Google Ads Remarketing Tag ID', placeholder: 'AW-1234567890' },
]

export function GtmProvisionForm({ tenantSlug, onProvision, disabled }: Props) {
  const { toast } = useToast()
  const [values, setValues] = useState<Partial<Record<PlatformKey, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const filledCount = Object.values(values).filter((v) => v?.trim()).length
  const visible = expanded ? PLATFORMS : PLATFORMS.slice(0, 4)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      // Strip empty values
      const cleaned: Partial<Record<PlatformKey, string>> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v?.trim()) cleaned[k as PlatformKey] = v.trim()
      }
      await onProvision({
        tenant_slug: tenantSlug,
        pixel_ids: cleaned,
      })
      toast({
        title: 'Container provisionado',
        description: `Web + Server clonados do master. Aguarde ~30s pra propagação.`,
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falhou ao provisionar',
        description: msg,
        variant: 'danger',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-h6 font-semibold text-fg-on-dark">
            Provisionar GTM
          </h3>
          <p className="text-body-sm text-fg-on-dark-muted mt-1">
            Pixel IDs por plataforma. Vazio = tag fica paused.{' '}
            <span className="text-fg-on-dark">{filledCount} preenchidos</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map((p) => (
          <Field
            key={p.key}
            id={`gtm-pixel-${p.key}`}
            label={p.label}
            hint={p.helper}
            type="text"
            placeholder={p.placeholder}
            value={values[p.key] ?? ''}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [p.key]: e.target.value }))
            }
            disabled={disabled || submitting}
          />
        ))}
      </div>

      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-body-sm text-brand-green hover:underline"
        >
          + Mostrar todas as {PLATFORMS.length} plataformas
        </button>
      )}

      <div className="mt-6 flex justify-end">
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={disabled || submitting}
        >
          {submitting ? 'Provisionando…' : 'Provisionar agora'}
        </Button>
      </div>
    </div>
  )
}
