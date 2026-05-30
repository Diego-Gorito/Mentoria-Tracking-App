// dashboardRange.ts — modelo único de range de datas pro Dashboard.
//
// Por quê um módulo dedicado: o filtro global (DashboardFilters) e todos os
// widgets (KPIs, charts, tables) precisam concordar no MESMO range. Em vez de
// Context (over-engineering pra uma árvore rasa Dashboard → 4 filhos), a gente
// prop-drilla um objeto `DashboardRange` imutável criado aqui.
//
// O backend analytics só entende buckets fixos (7d/30d/90d) via ?period=. Pra
// range "customizado" a gente:
//   1. calcula a duração em dias e mapeia pro bucket de API mais próximo
//      (`apiPeriod`) — isso decide QUANTOS dias o backend devolve;
//   2. guarda `from`/`to` (YYYY-MM-DD) pra recortar a série client-side e pra
//      label/legenda. Assim "customizado" funciona sem endpoint novo.

export type DashboardPreset = '7d' | '30d' | '90d' | 'custom'

// Buckets que o backend /api/analytics/* aceita em ?period=.
export type ApiPeriod = '7d' | '30d' | '90d'

export interface DashboardRange {
  /** Preset selecionado no filtro. 'custom' = usuário escolheu datas. */
  preset: DashboardPreset
  /** Início inclusivo, formato YYYY-MM-DD (UTC). */
  from: string
  /** Fim inclusivo, formato YYYY-MM-DD (UTC). */
  to: string
  /** Duração em dias (to - from + 1). Usado em hints "Últimos N dias". */
  days: number
  /** Bucket que o backend entende. Custom mapeia pro mais próximo. */
  apiPeriod: ApiPeriod
  /** Label curta pra UI ("7 dias", "01/05 – 28/05"). */
  label: string
}

/** YYYY-MM-DD de uma Date em UTC (consistente com o resto do analytics). */
export function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Parse YYYY-MM-DD pra Date em meia-noite UTC. */
function fromIsoDay(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`)
}

/** Diferença em dias inclusiva entre dois YYYY-MM-DD. */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = fromIsoDay(toIso).getTime() - fromIsoDay(fromIso).getTime()
  return Math.floor(ms / 86_400_000) + 1
}

/** Mapeia uma duração (dias) pro bucket de API mais próximo. */
export function nearestApiPeriod(days: number): ApiPeriod {
  if (days <= 14) return '7d'
  if (days <= 60) return '30d'
  return '90d'
}

function fmtBr(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Constrói um range a partir de um preset fixo (7/30/90 dias terminando hoje). */
export function presetRange(preset: '7d' | '30d' | '90d'): DashboardRange {
  const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30
  const to = new Date()
  const from = new Date(to.getTime() - (days - 1) * 86_400_000)
  return {
    preset,
    from: toIsoDay(from),
    to: toIsoDay(to),
    days,
    apiPeriod: preset,
    label: `${days} dias`,
  }
}

/**
 * Constrói um range customizado a partir de from/to (YYYY-MM-DD).
 * Normaliza ordem invertida e mapeia pro bucket de API mais próximo.
 */
export function customRange(fromIso: string, toIso: string): DashboardRange {
  // Garante from <= to.
  const [a, b] = fromIso <= toIso ? [fromIso, toIso] : [toIso, fromIso]
  const days = daysBetween(a, b)
  return {
    preset: 'custom',
    from: a,
    to: b,
    days,
    apiPeriod: nearestApiPeriod(days),
    label: `${fmtBr(a)} – ${fmtBr(b)}`,
  }
}

/** Range default do dashboard (30 dias). */
export const DEFAULT_RANGE: DashboardRange = presetRange('30d')

/**
 * Recorta uma série diária `{ day: YYYY-MM-DD, ... }` pro intervalo do range.
 * Necessário porque pro preset 'custom' o backend devolve o bucket inteiro
 * (ex 30d) mas a gente só quer mostrar as datas dentro de from..to.
 */
export function clipDailyToRange<T extends { day: string }>(
  rows: T[],
  range: DashboardRange,
): T[] {
  if (range.preset !== 'custom') return rows
  return rows.filter((r) => r.day >= range.from && r.day <= range.to)
}
