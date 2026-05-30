/**
 * SitesSelector — lista de sites detectados na conta Hostinger com
 * single-selection (radio buttons).
 *
 * Usado no Wizard V2 Step 3 após user conectar conta — mostra sites WP
 * detectados pra ele escolher 1 pra instalação no Step 4.
 *
 * Estados:
 *  - loading → 3 skeleton cards
 *  - error → mensagem + retry
 *  - empty → estado vazio + sugestão pra atualizar
 *  - lista → radio group com sites WordPress (não-WP ficam desabilitados)
 */

import { useId, useState, useEffect } from 'react';
import { Globe, Prohibit, ArrowsClockwise } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { useSites } from '@/hooks/useSites';
import type { EnrichedSite } from '@/types/sites';
import { cn } from '@/lib/utils';

interface Props {
  /** Disparado quando user seleciona um site (radio). */
  onSelect: (site: EnrichedSite) => void;
  /** Domain pré-selecionado (recovery on reload). */
  selectedDomain?: string;
}

function SiteCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-lg border border-border-default bg-white p-4 flex items-center gap-3 animate-pulse"
    >
      <div className="h-4 w-4 rounded-full bg-bg-muted shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 w-2/3 rounded bg-bg-muted" />
        <div className="h-3 w-1/3 rounded bg-bg-muted" />
      </div>
    </div>
  );
}

export function SitesSelector({ onSelect, selectedDomain }: Props) {
  const uid = useId();
  const { sites, isLoading, error, refresh } = useSites();
  const [selected, setSelected] = useState<string | undefined>(selectedDomain);

  // Sync prop selectedDomain → state se mudar externamente (recovery).
  useEffect(() => {
    if (selectedDomain && selectedDomain !== selected) setSelected(selectedDomain);
  }, [selectedDomain, selected]);

  const handleSelect = (site: EnrichedSite) => {
    if (!site.is_wordpress) return; // não-WP não selecionável
    setSelected(site.domain);
    onSelect(site);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <span className="sr-only">Carregando sites…</span>
        <SiteCardSkeleton />
        <SiteCardSkeleton />
        <SiteCardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-5 flex flex-col gap-3 text-center">
        <p className="text-body-sm text-fg-on-dark">
          Falha ao carregar sites: {error.message}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void refresh()} className="self-center">
          <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 flex flex-col gap-3 text-center">
        <p className="text-body-md text-fg-on-dark">Nenhum site detectado</p>
        <p className="text-body-sm text-fg-on-dark-muted">
          Sua conta Hostinger não tem sites visíveis pra essa API key. Verifique
          no hPanel ou atualize a lista.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void refresh()} className="self-center">
          <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
          Atualizar lista
        </Button>
      </div>
    );
  }

  const wpSites = sites.filter((s) => s.is_wordpress);
  const nonWpSites = sites.filter((s) => !s.is_wordpress);

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${uid}-label`}
      className="flex flex-col gap-2.5"
    >
      <p id={`${uid}-label`} className="text-body-sm text-fg-on-dark-muted">
        Escolha o site onde vamos instalar o tracking:
      </p>

      {wpSites.map((site) => {
        const isSelected = selected === site.domain;
        const inputId = `${uid}-site-${site.domain.replace(/[^\w]/g, '-')}`;
        return (
          <label
            key={site.domain}
            htmlFor={inputId}
            className={cn(
              'flex items-center gap-3 rounded-lg border bg-white p-4 cursor-pointer transition-all',
              'hover:border-zinc-300',
              isSelected
                ? 'border-brand-green ring-2 ring-brand-green/20'
                : 'border-border-default',
            )}
          >
            <input
              id={inputId}
              type="radio"
              name={`${uid}-radio`}
              value={site.domain}
              checked={isSelected}
              onChange={() => handleSelect(site)}
              className="h-4 w-4 accent-brand-green shrink-0"
              aria-describedby={`${inputId}-meta`}
            />
            <Globe
              size={18}
              weight="duotone"
              className="text-fg-on-light-muted shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-body-md font-semibold text-brand-black truncate">
                {site.domain}
              </p>
              <p
                id={`${inputId}-meta`}
                className="text-caption font-mono text-fg-on-light-muted tabular-nums"
              >
                {site.wp_version && <>WordPress {site.wp_version}</>}
                {site.php_version && <> · PHP {site.php_version}</>}
                {typeof site.ttfb_ms === 'number' && <> · {site.ttfb_ms}ms</>}
              </p>
              {site.status === 'installed' && (
                <p className="text-caption text-brand-green mt-0.5">
                  Já tem tracking instalado · container {site.container_id ?? '—'}
                </p>
              )}
            </div>
          </label>
        );
      })}

      {nonWpSites.length > 0 && (
        <details className="rounded-lg border border-white/10 bg-white/[0.02] mt-2">
          <summary className="px-4 py-3 cursor-pointer text-body-sm text-fg-on-dark-muted hover:bg-white/[0.03] transition-colors rounded-lg">
            {nonWpSites.length} site{nonWpSites.length !== 1 ? 's' : ''} sem WordPress (não suportado)
          </summary>
          <ul className="px-4 pb-3 flex flex-col gap-1">
            {nonWpSites.map((site) => (
              <li
                key={site.domain}
                className="flex items-center gap-2 text-caption text-fg-on-dark-subtle"
              >
                <Prohibit size={14} weight="bold" aria-hidden="true" />
                <span className="font-mono">{site.domain}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button
        type="button"
        onClick={() => void refresh()}
        className="text-caption text-fg-on-dark-subtle hover:text-fg-on-dark transition-colors self-start mt-1 inline-flex items-center gap-1.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        <ArrowsClockwise size={12} weight="bold" aria-hidden="true" />
        Atualizar lista
      </button>
    </div>
  );
}
