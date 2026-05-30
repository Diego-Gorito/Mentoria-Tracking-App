/**
 * PixelIdsForm — bloco colapsável "Quero configurar pixels agora (opcional)".
 *
 * Usado no Wizard V2 Step 2 antes do "Provisionar container". Tem 5 inputs
 * pros pixels mais comuns: meta, ga4_web, bing, tiktok, linkedin.
 *
 * Os IDs ficam vazios por default — o GTM master clona com placeholder
 * `REPLACE_VIA_PROVISION`. Caso user preencha aqui, vai direto no
 * POST /api/gtm/provision-container.
 */

import { useState, useId } from 'react';
import type { PlatformKey } from '@/hooks/useGtmContainer';
import { cn } from '@/lib/utils';

interface PixelDef {
  key: PlatformKey;
  label: string;
  placeholder: string;
  hint: string;
}

const PIXELS: PixelDef[] = [
  {
    key: 'meta',
    label: 'Meta (Facebook + Instagram)',
    placeholder: '1234567890',
    hint: 'Pixel ID — encontre em Meta Business → Eventos → Configurações.',
  },
  {
    key: 'ga4_web',
    label: 'Google Analytics 4',
    placeholder: 'G-XXXXXXX',
    hint: 'Measurement ID — Google Analytics → Admin → Streams.',
  },
  {
    key: 'bing',
    label: 'Microsoft (Bing) Ads',
    placeholder: '12345678',
    hint: 'UET Tag ID — Microsoft Ads → Tools → UET Tags.',
  },
  {
    key: 'tiktok',
    label: 'TikTok Ads',
    placeholder: 'CXXXXXXXXXX',
    hint: 'Pixel ID — TikTok Ads Manager → Assets → Events.',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn Ads',
    placeholder: '1234567',
    hint: 'Insight Tag Partner ID — LinkedIn Campaign Manager → Analyze.',
  },
];

interface Props {
  value: Partial<Record<PlatformKey, string>>;
  onChange: (next: Partial<Record<PlatformKey, string>>) => void;
  /** Inicia fechado por default — UX padrão do step (opcional). */
  defaultOpen?: boolean;
}

export function PixelIdsForm({ value, onChange, defaultOpen = false }: Props) {
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen);

  const handleChange = (key: PlatformKey, v: string) => {
    const trimmed = v.trim();
    const next = { ...value };
    if (trimmed) {
      next[key] = trimmed;
    } else {
      delete next[key];
    }
    onChange(next);
  };

  const filledCount = Object.values(value).filter((v) => !!v).length;

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className={cn(
        'rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-content`}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-body-sm font-medium text-fg-on-dark hover:bg-white/[0.03] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        <span id={`${uid}-title`} className="flex items-center gap-2">
          Quero configurar pixels agora (opcional)
          {filledCount > 0 && (
            <span className="text-caption text-brand-green font-mono tabular-nums">
              {filledCount} preenchido{filledCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div id={`${uid}-content`} className="px-4 pb-4 pt-1 flex flex-col gap-3">
          <p className="text-caption text-fg-on-dark-subtle">
            Se você já tem IDs de pixel anotados, cole agora. Senão, deixa em
            branco — você pode editar depois em <span className="font-mono">/integracoes/gtm</span>.
          </p>

          {PIXELS.map((pixel) => {
            const inputId = `${uid}-${pixel.key}`;
            const hintId = `${inputId}-hint`;
            return (
              <div key={pixel.key} className="flex flex-col gap-1">
                <label
                  htmlFor={inputId}
                  className="text-body-sm font-medium text-fg-on-dark-muted"
                >
                  {pixel.label}
                </label>
                <input
                  id={inputId}
                  type="text"
                  value={value[pixel.key] ?? ''}
                  onChange={(e) => handleChange(pixel.key, e.target.value)}
                  placeholder={pixel.placeholder}
                  aria-describedby={hintId}
                  spellCheck={false}
                  className="w-full h-10 px-3 rounded-md text-body-sm bg-white/[0.04] border border-white/10 text-fg-on-dark placeholder:text-fg-on-dark-subtle focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-colors"
                />
                <p id={hintId} className="text-caption text-fg-on-dark-subtle">
                  {pixel.hint}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
