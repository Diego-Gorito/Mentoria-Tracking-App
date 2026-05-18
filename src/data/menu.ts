// Definição canônica dos 6 menu items do Tracking App.
// Fonte de verdade pra Sidebar desktop, MobileSidebar e breadcrumbs futuros.

import {
  ChartLine,
  Pulse,
  Target,
  Plugs,
  Users,
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
