/**
 * MetaSelectStep — Step C do conector Meta Ads. Dois dropdowns dependentes:
 * ad account → pixels. Ao selecionar o pixel e confirmar, dispara POST /select
 * (grava + escreve no container GTM).
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import type { MetaAdAccountView, MetaPixelView } from '@/lib/api'

interface Props {
  adAccounts: MetaAdAccountView[]
  pixels: MetaPixelView[]
  pixelsLoading: boolean
  selecting: boolean
  error: string | null
  onLoadPixels: (adAccountId: string) => void
  onSelect: (adAccountId: string, pixelId: string) => void
}

const selectClass = cn(
  'w-full h-10 px-3 rounded-md text-body-sm transition-colors',
  'bg-white/[0.04] border border-white/10 text-fg-on-dark',
  'focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green',
  'disabled:opacity-50 disabled:cursor-not-allowed',
)

function accountStatusLabel(status: number): string {
  // account_status do Graph: 1 ACTIVE, 2 DISABLED, 3 UNSETTLED, 7 PENDING_RISK_REVIEW, etc.
  return status === 1 ? '' : ' (inativa)'
}

export function MetaSelectStep({
  adAccounts,
  pixels,
  pixelsLoading,
  selecting,
  error,
  onLoadPixels,
  onSelect,
}: Props) {
  const [adAccountId, setAdAccountId] = useState('')
  const [pixelId, setPixelId] = useState('')

  // Ao trocar de ad account, reseta o pixel e recarrega a lista.
  useEffect(() => {
    if (!adAccountId) return
    setPixelId('')
    onLoadPixels(adAccountId)
  }, [adAccountId, onLoadPixels])

  const canConfirm = !!adAccountId && !!pixelId && !selecting

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 space-y-5">
      <div>
        <h3 className="text-h6 font-semibold text-fg-on-dark">
          Escolha a conta e o pixel
        </h3>
        <p className="text-body-sm text-fg-on-dark-muted mt-1">
          Selecione a conta de anúncios e o pixel que vamos conectar ao seu
          rastreamento server-side.
        </p>
      </div>

      {/* Ad account */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="meta-ad-account" className="text-body-sm font-medium text-fg-on-dark-muted">
          Conta de anúncios
        </label>
        <select
          id="meta-ad-account"
          className={selectClass}
          value={adAccountId}
          onChange={(e) => setAdAccountId(e.target.value)}
        >
          <option value="">Selecione…</option>
          {adAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {accountStatusLabel(a.status)} — {a.id}
            </option>
          ))}
        </select>
        {adAccounts.length === 0 && (
          <p className="text-caption text-warning">
            Nenhuma conta de anúncios encontrada nesse token. Confira se você deu
            “Controle total” da conta ao usuário do sistema (passo 3 do guia).
          </p>
        )}
      </div>

      {/* Pixel */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="meta-pixel" className="text-body-sm font-medium text-fg-on-dark-muted">
          Pixel
        </label>
        <select
          id="meta-pixel"
          className={selectClass}
          value={pixelId}
          onChange={(e) => setPixelId(e.target.value)}
          disabled={!adAccountId || pixelsLoading}
        >
          <option value="">
            {pixelsLoading ? 'Carregando pixels…' : 'Selecione…'}
          </option>
          {pixels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.id}
            </option>
          ))}
        </select>
        {!pixelsLoading && adAccountId && pixels.length === 0 && (
          <p className="text-caption text-warning">
            Essa conta não tem pixels. Crie um no Gerenciador de Eventos do Meta e
            recarregue.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-caption text-red-400">
          {error}
        </p>
      )}

      <div className="flex justify-end pt-1">
        <Button
          variant="primary"
          loading={selecting}
          disabled={!canConfirm}
          onClick={() => onSelect(adAccountId, pixelId)}
        >
          Conectar pixel ao container
        </Button>
      </div>
    </div>
  )
}
