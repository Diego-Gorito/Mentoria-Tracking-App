// workers/lib/costsync/registry.ts
// Registro de providers de custo por plataforma. Adicionar uma plataforma = 1 linha
// aqui + a credencial em ad_accounts. O orquestrador pula plataformas sem provider.
// @see docs/adr-0011 §5b
//
// Prontas (token + API de spend): meta (provado). Taboola/Pinterest = providers a
// adicionar (credencial já existe no env). Google Ads/TikTok = faltam credencial.

import type { ICostProvider } from './types'
import { MetaCostProvider } from './providers/MetaCostProvider'

const providers: Record<string, ICostProvider> = {
  meta: new MetaCostProvider(),
  // taboola:   new TaboolaCostProvider(),    // TODO #73 — TABOOLA_CLIENT_* no env
  // pinterest: new PinterestCostProvider(),  // TODO #73 — PINTEREST_ACCESS_TOKEN no env
  // google:    new GoogleAdsCostProvider(),  // bloqueado: falta developer token
  // tiktok:    new TikTokCostProvider(),     // bloqueado: falta access token
}

/** Retorna o provider da plataforma, ou null se não suportada/conectada ainda. */
export function getCostProvider(platform: string): ICostProvider | null {
  return providers[platform] ?? null
}

/** Plataformas com provider de custo implementado. */
export function supportedCostPlatforms(): string[] {
  return Object.keys(providers)
}
