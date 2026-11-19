import { act, renderHook } from '@testing-library/react'
import { useSceneImages } from '../../src/components/CanvasPage/useSceneImages'
import { createSceneNode } from '../../src/components/CanvasPage/sceneNode'
import type { NodeLink, SceneModifiers } from '../../src/components/CanvasPage/graph'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useSceneImages', () => {
  const createURL = vi.fn()
  const revokeURL = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    createURL.mockReset().mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two')
    revokeURL.mockReset()
    vi.stubGlobal('URL', { createObjectURL: createURL, revokeObjectURL: revokeURL })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('debounces exports, replaces URLs on revision changes and revokes on unmount', async () => {
    const scene = createSceneNode('a', 'A', 0, 0)
    const scenes = [scene]
    const links: NodeLink[] = [{ from: 'a', to: 'composition' }]
    const modifiers = new Map<string, SceneModifiers>()
    let revisions = new Map([['a', 1]])
    const blob = new Blob(['image'])
    const exporter = vi.fn().mockResolvedValue(blob)
    const getExporter = () => exporter
    const { result, rerender, unmount } = renderHook(() =>
      useSceneImages(scenes, links, modifiers, getExporter, revisions),
    )
    await act(async () => {
      vi.advanceTimersByTime(99)
    })
    expect(exporter).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(exporter).toHaveBeenCalledWith({ format: 'png', scale: 1, transparent: false })
    expect(createURL).toHaveBeenCalledWith(blob)
    expect(result.current.get('a')).toBe('blob:one')

    revisions = new Map([['a', 2]])
    rerender()
    expect(result.current.get('a')).toBe('blob:one')
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(exporter).toHaveBeenCalledTimes(2)
    expect(result.current.get('a')).toBe('blob:two')
    expect(revokeURL).toHaveBeenCalledWith('blob:one')
    unmount()
    expect(revokeURL).toHaveBeenCalledWith('blob:two')
  })

  it('ignores stale in-flight exports when revisions change', async () => {
    const scenes = [createSceneNode('a', 'A', 0, 0)]
    const links: NodeLink[] = [{ from: 'a', to: 'composition' }]
    const modifiers = new Map<string, SceneModifiers>()
    let revisions = new Map([['a', 1]])
    const first = deferred<Blob>()
    const second = deferred<Blob>()
    const exporter = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const getExporter = () => exporter
    const { result, rerender, unmount } = renderHook(() =>
      useSceneImages(scenes, links, modifiers, getExporter, revisions),
    )
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    revisions = new Map([['a', 2]])
    rerender()
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    const fresh = new Blob(['fresh'])
    await act(async () => {
      second.resolve(fresh)
      await second.promise
    })
    await act(async () => {
      first.resolve(new Blob(['stale']))
      await first.promise
    })
    expect(createURL).toHaveBeenCalledTimes(1)
    expect(createURL).toHaveBeenCalledWith(fresh)
    expect(result.current.get('a')).toBe('blob:one')
    unmount()
  })

  it('only exports active links and cleans up when the last link is muted', async () => {
    const scenes = [createSceneNode('a', 'A', 0, 0), createSceneNode('b', 'B', 0, 0)]
    let links: NodeLink[] = [
      { from: 'a', to: 'one', muted: true },
      { from: 'a', to: 'two' },
      { from: 'b', to: 'one', muted: true },
    ]
    const modifiers = new Map<string, SceneModifiers>()
    const revisions = new Map<string, number>()
    const exporter = vi.fn().mockResolvedValue(new Blob())
    const getExporter = vi.fn(() => exporter)
    const { result, rerender, unmount } = renderHook(() =>
      useSceneImages(scenes, links, modifiers, getExporter, revisions),
    )
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(getExporter).toHaveBeenCalledTimes(1)
    expect(getExporter).toHaveBeenCalledWith('a')
    expect(result.current.get('a')).toBe('blob:one')
    expect(result.current.has('b')).toBe(false)
    links = links.map((link) => ({ ...link, muted: true }))
    rerender()
    expect(result.current.has('a')).toBe(false)
    expect(revokeURL).toHaveBeenCalledWith('blob:one')
    unmount()
  })

  it('cancels pending timers and ignores in-flight exports after a link is muted or unmounted', async () => {
    const scenes = [createSceneNode('a', 'A', 0, 0)]
    let links: NodeLink[] = [{ from: 'a', to: 'composition' }]
    const modifiers = new Map<string, SceneModifiers>()
    const revisions = new Map<string, number>()
    const pending = deferred<Blob>()
    const exporter = vi.fn().mockReturnValue(pending.promise)
    const getExporter = () => exporter
    const { rerender, unmount } = renderHook(() =>
      useSceneImages(scenes, links, modifiers, getExporter, revisions),
    )
    links = [{ from: 'a', to: 'composition', muted: true }]
    rerender()
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(exporter).not.toHaveBeenCalled()
    links = [{ from: 'a', to: 'composition' }]
    rerender()
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(exporter).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => {
      pending.resolve(new Blob())
      await pending.promise
    })
    expect(createURL).not.toHaveBeenCalled()
  })
})
