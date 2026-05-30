// useInterval.test.tsx — timer declarativo do auto-refresh do dashboard.
// Cobre: tick no intervalo, pausa com delay=null, callback sempre fresco.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useInterval } from '../useInterval'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useInterval', () => {
  it('chama o callback a cada `delay` ms', () => {
    const cb = vi.fn()
    renderHook(() => useInterval(cb, 1000))

    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('delay=null pausa o timer (não dispara)', () => {
    const cb = vi.fn()
    renderHook(() => useInterval(cb, null))
    vi.advanceTimersByTime(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('alternar delay → null pausa um timer que estava rodando', () => {
    const cb = vi.fn()
    const { rerender } = renderHook(({ d }: { d: number | null }) => useInterval(cb, d), {
      initialProps: { d: 1000 as number | null },
    })

    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)

    rerender({ d: null })
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1) // não avançou mais
  })

  it('usa sempre a versão mais recente do callback (sem stale closure)', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useInterval(cb, 1000), {
      initialProps: { cb: first },
    })

    rerender({ cb: second })
    vi.advanceTimersByTime(1000)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('limpa o interval no unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useInterval(cb, 1000))
    unmount()
    vi.advanceTimersByTime(3000)
    expect(cb).not.toHaveBeenCalled()
  })
})
