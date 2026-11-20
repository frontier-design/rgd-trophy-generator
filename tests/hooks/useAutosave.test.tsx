import { act, renderHook } from '@testing-library/react'
import { useAutosave } from '../../src/hooks'
import { readSaved } from '../../src/state'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useAutosave async ordering', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes only after async serialization (asset writes) finishes', async () => {
    vi.useFakeTimers()
    const gates: Deferred[] = []
    const serialize = vi.fn(async (value: { n: number }) => {
      const gate = deferred()
      gates.push(gate)
      await gate.promise
      return { ...value, stored: true }
    })
    const { rerender } = renderHook(
      ({ value }) => useAutosave('canvas', value, { delay: 0, serialize }),
      { initialProps: { value: { n: 1 } } },
    )

    rerender({ value: { n: 2 } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(serialize).toHaveBeenCalledTimes(1)
    // The document isn't published while its asset write is pending.
    expect(readSaved('canvas')).toBeUndefined()

    // A newer change arrives before the first write completes: it queues behind it.
    rerender({ value: { n: 3 } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    await act(async () => {
      gates[0]?.resolve()
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(readSaved('canvas')).toEqual({ n: 2, stored: true })

    await act(async () => {
      gates[1]?.resolve()
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(readSaved('canvas')).toEqual({ n: 3, stored: true })
  })
})
