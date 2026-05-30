// dashboardRange.test.ts — date-math do filtro de período do dashboard.
// Cobre: presets, custom (normalização + bucket de API), recorte da série.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  presetRange,
  customRange,
  daysBetween,
  nearestApiPeriod,
  clipDailyToRange,
  toIsoDay,
  DEFAULT_RANGE,
} from '../dashboardRange'

// Fixa "hoje" pra os presets serem determinísticos.
const NOW = new Date('2026-05-29T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('presetRange', () => {
  it('7d → 7 dias terminando hoje (inclusivo)', () => {
    const r = presetRange('7d')
    expect(r.preset).toBe('7d')
    expect(r.apiPeriod).toBe('7d')
    expect(r.days).toBe(7)
    expect(r.to).toBe('2026-05-29')
    expect(r.from).toBe('2026-05-23') // 29,28,27,26,25,24,23 = 7 dias
    expect(daysBetween(r.from, r.to)).toBe(7)
  })

  it('30d e 90d batem a duração e o bucket de API', () => {
    expect(presetRange('30d').days).toBe(30)
    expect(presetRange('30d').apiPeriod).toBe('30d')
    expect(presetRange('90d').days).toBe(90)
    expect(presetRange('90d').apiPeriod).toBe('90d')
  })

  it('DEFAULT_RANGE é 30 dias', () => {
    expect(DEFAULT_RANGE.preset).toBe('30d')
    expect(DEFAULT_RANGE.days).toBe(30)
  })
})

describe('customRange', () => {
  it('normaliza ordem invertida (from > to vira to..from)', () => {
    const r = customRange('2026-05-20', '2026-05-10')
    expect(r.from).toBe('2026-05-10')
    expect(r.to).toBe('2026-05-20')
    expect(r.days).toBe(11)
    expect(r.preset).toBe('custom')
  })

  it('mapeia duração curta pro bucket de API mais próximo', () => {
    // 5 dias → 7d
    expect(customRange('2026-05-25', '2026-05-29').apiPeriod).toBe('7d')
    // 40 dias → 30d
    expect(customRange('2026-04-20', '2026-05-29').apiPeriod).toBe('30d')
    // 120 dias → 90d
    expect(customRange('2026-01-30', '2026-05-29').apiPeriod).toBe('90d')
  })

  it('label formata DD/MM – DD/MM', () => {
    expect(customRange('2026-05-01', '2026-05-28').label).toBe('01/05 – 28/05')
  })
})

describe('nearestApiPeriod', () => {
  it('limites dos buckets', () => {
    expect(nearestApiPeriod(1)).toBe('7d')
    expect(nearestApiPeriod(14)).toBe('7d')
    expect(nearestApiPeriod(15)).toBe('30d')
    expect(nearestApiPeriod(60)).toBe('30d')
    expect(nearestApiPeriod(61)).toBe('90d')
    expect(nearestApiPeriod(365)).toBe('90d')
  })
})

describe('daysBetween', () => {
  it('é inclusivo nas duas pontas', () => {
    expect(daysBetween('2026-05-29', '2026-05-29')).toBe(1)
    expect(daysBetween('2026-05-01', '2026-05-31')).toBe(31)
  })
})

describe('clipDailyToRange', () => {
  const rows = [
    { day: '2026-05-01', n: 1 },
    { day: '2026-05-15', n: 2 },
    { day: '2026-05-29', n: 3 },
  ]

  it('NÃO recorta pra presets fixos (backend já devolve o bucket certo)', () => {
    expect(clipDailyToRange(rows, presetRange('30d'))).toHaveLength(3)
  })

  it('recorta pro intervalo do range custom', () => {
    const r = customRange('2026-05-10', '2026-05-20')
    const out = clipDailyToRange(rows, r)
    expect(out).toEqual([{ day: '2026-05-15', n: 2 }])
  })
})

describe('toIsoDay', () => {
  it('formata Date em YYYY-MM-DD UTC', () => {
    expect(toIsoDay(new Date('2026-05-29T23:59:00.000Z'))).toBe('2026-05-29')
  })
})
