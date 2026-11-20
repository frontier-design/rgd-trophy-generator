import { act, renderHook } from '@testing-library/react'
import { DEFAULT_PATTERN } from '../../src/components/CanvasPage/graph'
import { usePatternMaps } from '../../src/hooks'
import { gray, type Gray } from '../../src/pattern'

// Image decodes are held open, so a job can be made to finish after a newer one.
const pending = vi.hoisted(() => new Map<string, (image: Gray) => void>())

vi.mock('../../src/components/CanvasPage/patternImage', async () => {
  const { gray: makeGray } = await import('../../src/pattern')
  return {
    imageFileToUrl: async () => 'data:image/png;base64,',
    imageToGray: (url: string) =>
      new Promise<Gray>((resolve) => {
        pending.set(url, resolve)
      }),
    fittedSize: () => ({ width: 1, height: 1 }),
    STORED_IMAGE_MAX_SIDE: 5000,
    PATTERN_WORKING_MAX_SIDE: 2048,
    __makeGray: makeGray,
  }
})

const node = (image: string) => ({
  id: 'a',
  params: { ...DEFAULT_PATTERN, mode: 'repeat' as const, fold: 'none' as const, softness: 0, image },
})

describe('usePatternMaps stale results', () => {
  it('keeps the newest crop/image result when an older job finishes later', async () => {
    vi.useFakeTimers()
    try {
      let nodes = [node('old')]
      const { result, rerender } = renderHook(() => usePatternMaps(nodes))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      const resolveOld = pending.get('old')
      expect(resolveOld).toBeTruthy()

      // A newer image supersedes the job still waiting on the old decode.
      nodes = [node('new')]
      rerender()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      const resolveNew = pending.get('new')
      expect(resolveNew).toBeTruthy()

      await act(async () => {
        resolveNew?.(gray(10, 10, new Uint8Array(100).fill(200)))
        await vi.advanceTimersByTimeAsync(20)
      })
      const newest = result.current.get('a')?.map
      expect(newest?.data[0]).toBe(255)

      // The older job finishing now must not replace the newer map.
      await act(async () => {
        resolveOld?.(gray(10, 10, new Uint8Array(100)))
        await vi.advanceTimersByTimeAsync(20)
      })
      expect(result.current.get('a')?.map).toBe(newest)
      expect(result.current.get('a')?.map?.data[0]).toBe(255)
    } finally {
      vi.useRealTimers()
    }
  })
})
