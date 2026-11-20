import { renderHook, waitFor } from '@testing-library/react'
import { DEFAULT_PATTERN } from '../../src/components/CanvasPage/graph'
import { usePatternMaps } from '../../src/hooks'
import { gray } from '../../src/pattern'

// jsdom can't decode images: hand back a small ornament (bright dots in a tall strip).
vi.mock('../../src/components/CanvasPage/patternImage', async () => {
  const { gray } = await import('../../src/pattern')
  return {
    imageFileToUrl: async () => 'data:image/png;base64,',
    imageToGray: async () => {
      const image = gray(12, 40)
      for (let y = 4; y < 36; y++)
        for (let x = 3; x < 9; x++) image.data[y * 12 + x] = (x + y) % 3 === 0 ? 255 : 0
      return image
    },
  }
})

const node = (id: string, patch = {}) => ({
  id,
  params: {
    ...DEFAULT_PATTERN,
    mode: 'generate' as const,
    detail: 8,
    length: 12,
    size: 2,
    ...patch,
  },
})

describe('usePatternMaps', () => {
  it('builds each pattern node’s map in the background', async () => {
    const { result } = renderHook(() => usePatternMaps([node('pattern-1')]))
    expect(result.current.get('pattern-1')?.busy).toBe(true)
    await waitFor(() => expect(result.current.get('pattern-1')?.map).not.toBeNull())
    expect(result.current.get('pattern-1')?.busy).toBe(false)
    expect(result.current.get('pattern-1')?.message).toMatch(/pieces/)
    void gray
  })

  it('rebuilds when the crop changes (zoom/pan viewer state is not in the params)', async () => {
    let nodes = [node('a', { crop: { x: 0, y: 0, width: 0.5, height: 1 } })]
    const { result, rerender } = renderHook(() => usePatternMaps(nodes))
    await waitFor(() => expect(result.current.get('a')?.map).toBeTruthy())
    const first = result.current.get('a')?.map

    nodes = [node('a', { crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.7 } })]
    rerender()
    expect(result.current.get('a')?.busy).toBe(true)
    await waitFor(() => expect(result.current.get('a')?.busy).toBe(false))
    expect(result.current.get('a')?.map).not.toBe(first)
  })

  it('rebuilds when a map field changes, not when the placement does, and forgets removed nodes', async () => {
    let nodes = [node('a')]
    const { result, rerender } = renderHook(() => usePatternMaps(nodes))
    await waitFor(() => expect(result.current.get('a')?.map).toBeTruthy())
    const first = result.current.get('a')?.map

    nodes = [node('a', { repeats: 9, strength: 10, fade: 40 })]
    rerender()
    expect(result.current.get('a')?.map).toBe(first)
    expect(result.current.get('a')?.busy).toBe(false)

    nodes = [node('a', { seed: 99 })]
    rerender()
    expect(result.current.get('a')?.busy).toBe(true)
    await waitFor(() => expect(result.current.get('a')?.busy).toBe(false))
    expect(result.current.get('a')?.map).not.toBe(first)

    nodes = []
    rerender()
    await waitFor(() => expect(result.current.has('a')).toBe(false))
  })
})
