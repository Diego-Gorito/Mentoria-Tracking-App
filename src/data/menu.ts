// Definição canônica dos 7 menu items do Tracking App.
// Fonte de verdade pra Sidebar desktop, MobileSidebar e breadcrumbs futuros.
// F-S10 (2026-05-26): nova entrada "Sites Conectados" inserida entre Leads e
// Configurações per UX §2.1 + UX-001 (auto-provisioner GTM flow).

import {
  ChartLine,
  Pulse,
  Target,
  Plugs,
  Users,
  GlobeHemisphereWest,
  Gear,
} from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

export type MenuItem = {
  id: string
  label: string
  icon: PhosphorIcon
  path: string
  /** Badge numérico — null = sem badge */
  badge: number | null
  /** Descrição pra tooltip e screen readers */
  description: string
}

export const MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: ChartLine,
    path: '/dashboard',
    badge: null,
    description: 'Visão geral: KPIs, funil e ROAS por plataforma',
  },
  {
    id: 'tracking',
    label: 'Tracking',
    icon: Pulse,
    path: '/tracking',
    badge: null,
    description: 'Eventos recentes recebidos via webhook',
  },
  {
    id: 'conversoes',
    label: 'Conversões',
    icon: Target,
    path: '/conversoes',
    badge: null,
    description: 'Conversões e dispatches por plataforma de anúncio',
  },
  {
    id: 'integracoes',
    label: 'Integrações',
    icon: Plugs,
    path: '/integracoes',
    badge: null,
    description: 'Configure tokens das plataformas de anúncio e conversão',
  },
  {
    id: 'leads',
    label: 'Leads',
    icon: Users,
    path: '/leads',
    badge: null,
    description: 'Leads quentes com score e canal de origem',
  },
  {
    // F-S10 AC-5 — entrada "Sites Conectados" entre Leads e Configurações
    // (per UX §2.1 + UX-001: "Sites Conectados nível 1 do menu pra dar
    // visibilidade ao estado conectado/não-conectado"). Posição = penúltimo
    // pra manter Configurações no final como bottom utility.
    id: 'sites',
    label: 'Sites Conectados',
    icon: GlobeHemisphereWest,
    path: '/sites',
    badge: null,
    description: 'Sites WordPress conectados via Hostinger com tracking GTM instalado',
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Gear,
    path: '/configuracoes',
    badge: null,
    description: 'Perfil, time e preferências da conta',
  },
]

/** Retorna o item ativo dado um pathname atual */
export function getActiveItem(pathname: string): MenuItem | undefined {
  // Match exato primeiro, depois por prefixo (rota aninhada)
  return (
    MENU_ITEMS.find((item) => item.path === pathname) ??
    MENU_ITEMS.find(
      (item) => item.path !== '/dashboard' && pathname.startsWith(item.path + '/'),
    )
  )
}
