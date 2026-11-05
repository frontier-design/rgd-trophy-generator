import { act, renderHook } from '@testing-library/react'
import { useUndo } from '../../src/hooks'

type State = { items: readonly number[] }

/** A state held outside React, as the canvas holds its scenes, restored through `restore`. */
function setup(initial: State) {
  let restored: State | null = null
  const hook = renderHook(
    ({ state }) =>
      useUndo(state, (next) => {
        restored = next
      }),
    { initialProps: { state: initial } },
  )
  const change = (state: State) => hook.rerender({ state })
  const settle = () => act(() => vi.advanceTimersByTime(400))
  return { hook, change, settle, restored: () => restored }
}

describe('useUndo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('undoes and redoes settled changes, one step each', () => {
    const a = { items: [1] }
    const b = { items: [1, 2] }
    const c = { items: [1, 2, 3] }
    const { hook, change, settle, restored } = setup(a)
    change(b)
    settle()
    change(c)
    settle()
    hook.result.current.undo()
    expect(restored()).toEqual(b)
    change(restored()!)
    hook.result.current.undo()
    expect(restored()).toEqual(a)
    change(restored()!)
    hook.result.current.undo() // nothing further back
    expect(restored()).toEqual(a)
    hook.result.current.redo()
    expect(restored()).toEqual(b)
    hook.result.current.redo()
    expect(restored()).toEqual(c)
  })

  it('makes a quick run of changes (a drag) one step, and a change still settling undoable', () => {
    const { hook, change, restored } = setup({ items: [] })
    // Each a frame apart: never settles in between.
    change({ items: [1] })
    act(() => vi.advanceTimersByTime(16))
    change({ items: [2] })
    hook.result.current.undo()
    expect(restored()).toEqual({ items: [] })
  })

  it('waits for the pointer to lift before recording', () => {
    const start = { items: [] }
    const { hook, change, settle, restored } = setup(start)
    act(() => window.dispatchEvent(new Event('pointerdown')))
    change({ items: [1] })
    settle()
    change({ items: [2] })
    settle()
    act(() => window.dispatchEvent(new Event('pointerup')))
    settle()
    hook.result.current.undo()
    expect(restored()).toEqual(start)
  })

  it('drops undone steps after a new change', () => {
    const { hook, change, settle, restored } = setup({ items: [] })
    change({ items: [1] })
    settle()
    hook.result.current.undo()
    change(restored()!)
    change({ items: [9] })
    settle()
    hook.result.current.redo()
    expect(restored()).toEqual({ items: [] })
  })
})
