import { act, renderHook } from '@testing-library/react'
import {
  createModifier,
  modifiersByScene,
  type TextNode,
} from '../../src/components/CanvasPage/graph'
import { textOf, type TextLine } from '../../src/components/CanvasPage/textLines'
import { useTypingPlayback } from '../../src/components/CanvasPage/useTypingPlayback'

const textNode = (lines: TextLine[]): TextNode => ({
  ...(createModifier('text', 't', 'text', 0, 0) as TextNode),
  params: { lines },
})

it('types each line at its own speed in linked scenes, leaving the source whole', () => {
  vi.useFakeTimers()
  try {
    const node = textNode([
      { text: 'A😀B', speed: 2, tracking: 0 },
      { text: 'CD', speed: 4, tracking: 20 },
    ])
    const nodes = [node]
    const links = [
      { from: 't', to: 'one' },
      { from: 't', to: 'two' },
    ]
    const { result } = renderHook(() => useTypingPlayback(nodes))
    act(() => result.current.toggle('t'))
    const texts = () =>
      [...modifiersByScene(links, result.current.previewNodes).values()].map((value) => value.text)
    act(() => vi.advanceTimersByTime(100))
    expect(texts()).toEqual(['', ''])
    act(() => vi.advanceTimersByTime(1000))
    expect(texts()).toEqual(['A😀', 'A😀'])
    // The first line takes 1.5 s; the second types twice as fast.
    act(() => vi.advanceTimersByTime(650))
    expect(texts()).toEqual(['A😀B\nC', 'A😀B\nC'])
    // Tracking carries over to the typed lines.
    expect(modifiersByScene(links, result.current.previewNodes).get('one')?.lineTracking).toEqual([
      0, 20,
    ])
    expect(textOf(node.params.lines)).toBe('A😀B\nCD')
    act(() => vi.advanceTimersByTime(500))
    expect(texts()).toEqual(['A😀B\nCD', 'A😀B\nCD'])
    expect(result.current.playing.t).toBeUndefined()
    act(() => result.current.toggle('t'))
    act(() => result.current.toggle('t'))
    expect(texts()).toEqual(['A😀B\nCD', 'A😀B\nCD'])
  } finally {
    vi.useRealTimers()
  }
})

it('cancels playback when the source is edited or deleted, but not on speed changes', () => {
  const line = { text: 'hello', speed: 8, tracking: 0 }
  const node = textNode([line])
  const { result, rerender } = renderHook(({ nodes }) => useTypingPlayback(nodes), {
    initialProps: { nodes: [node] },
  })
  act(() => result.current.toggle('t'))
  rerender({ nodes: [textNode([{ ...line, speed: 20 }])] })
  expect(result.current.playing.t).toBeDefined()
  rerender({ nodes: [textNode([{ ...line, text: 'edited' }])] })
  expect(result.current.playing.t).toBeUndefined()
  expect(result.current.previewNodes[0]?.params).toEqual({ lines: [{ ...line, text: 'edited' }] })
  act(() => result.current.toggle('t'))
  rerender({ nodes: [] })
  expect(result.current.playing.t).toBeUndefined()
})

it('seeks a node to a time, over live playback, until seeked back', () => {
  const node = textNode([
    { text: 'AB', speed: 2, tracking: 0 },
    { text: 'CD', speed: 4, tracking: 0 },
  ])
  const nodes = [node]
  const links = [{ from: 't', to: 'scene' }]
  const { result } = renderHook(() => useTypingPlayback(nodes))
  const text = () => modifiersByScene(links, result.current.previewNodes).get('scene')?.text
  act(() => result.current.seek('t', 0))
  expect(text()).toBe('')
  act(() => result.current.seek('t', 0.5))
  expect(text()).toBe('A')
  // The first line takes 1 s; the second 0.5 s.
  act(() => result.current.seek('t', 1.25))
  expect(text()).toBe('AB\nC')
  // Past the typing: all of it.
  act(() => result.current.seek('t', 9))
  expect(text()).toBe('AB\nCD')
  act(() => result.current.toggle('t'))
  act(() => result.current.seek('t', 0.5))
  expect(text()).toBe('A')
  act(() => result.current.seek('t', null))
  // Live playback again (just started: nothing typed yet).
  expect(text()).toBe('')
})
