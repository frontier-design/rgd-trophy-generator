import { act, renderHook } from '@testing-library/react'
import { createModifier, modifiersByScene } from '../../src/components/CanvasPage/graph'
import { useTypingPlayback } from '../../src/components/CanvasPage/useTypingPlayback'

it('previews linked scenes without changing source text and restores on stop or completion', () => {
  vi.useFakeTimers()
  try {
    const node = {
      ...createModifier('text', 't', 'text', 0, 0),
      kind: 'text' as const,
      params: { text: 'A😀B' },
    }
    const nodes = [node]
    const links = [
      { from: 't', to: 'one' },
      { from: 't', to: 'two' },
    ]
    const { result } = renderHook(() => useTypingPlayback(nodes))
    act(() => {
      result.current.setSpeed('t', 2)
      result.current.toggle('t', node.params.text)
    })
    const texts = () =>
      [...modifiersByScene(links, result.current.previewNodes).values()].map((value) => value.text)
    expect(texts()).toEqual(['', ''])
    act(() => vi.advanceTimersByTime(1000))
    expect(texts()).toEqual(['A😀', 'A😀'])
    expect(node.params.text).toBe('A😀B')
    act(() => vi.advanceTimersByTime(500))
    expect(texts()).toEqual(['A😀B', 'A😀B'])
    expect(result.current.playing.t).toBeUndefined()
    act(() => result.current.toggle('t', node.params.text))
    act(() => result.current.toggle('t', node.params.text))
    expect(texts()).toEqual(['A😀B', 'A😀B'])
  } finally {
    vi.useRealTimers()
  }
})

it('cancels playback when the source is edited or deleted', () => {
  const node = {
    ...createModifier('text', 't', 'text', 0, 0),
    kind: 'text' as const,
    params: { text: 'hello' },
  }
  const { result, rerender } = renderHook(({ nodes }) => useTypingPlayback(nodes), {
    initialProps: { nodes: [node] },
  })
  act(() => result.current.toggle('t', 'hello'))
  rerender({ nodes: [{ ...node, params: { text: 'edited' } }] })
  expect(result.current.playing.t).toBeUndefined()
  expect(result.current.previewNodes[0]?.params).toEqual({ text: 'edited' })
  act(() => result.current.toggle('t', 'edited'))
  rerender({ nodes: [] })
  expect(result.current.playing.t).toBeUndefined()
})
