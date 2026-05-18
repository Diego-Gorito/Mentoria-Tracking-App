import { Lightbulb, LightbulbFilament } from '@phosphor-icons/react'
import { useSpotlight } from '@/lib/spotlight'

// Botão pequeno fixed no canto direito pra ligar/desligar spotlight do cursor
export function SpotlightToggle() {
  const { enabled, toggle } = useSpotlight()
  return (
    <button
      onClick={toggle}
      aria-label={enabled ? 'Desativar spotlight do cursor' : 'Ativar spotlight do cursor'}
      title={enabled ? 'Spotlight ON' : 'Spotlight OFF'}
      className="fixed bottom-4 right-4 z-tooltip h-9 w-9 rounded-full backdrop-blur-xl border transition-all duration-base flex items-center justify-center group shadow-lg"
      style={{
        background: enabled ? 'rgba(22, 223, 111, 0.10)' : 'var(--app-pill-bg)',
        borderColor: enabled ? 'rgba(22, 223, 111, 0.35)' : 'var(--app-pill-border)',
        color: enabled ? '#16df6f' : 'var(--app-fg-muted)',
      }}
    >
      {enabled ? (
        <LightbulbFilament size={15} weight="fill" />
      ) : (
        <Lightbulb size={15} weight="regular" />
      )}
    </button>
  )
}
