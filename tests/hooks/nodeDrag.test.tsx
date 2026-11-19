import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  createNodePositionStore,
  NodeDragContext,
  useNodeDrag,
  useNodePosition,
} from '../../src/components/CanvasPage/nodeDrag'

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
beforeEach(() => {
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((run: FrameRequestCallback) => {
      frames.set(++nextFrame, run)
      return nextFrame
    }),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  )
})
afterEach(() => vi.unstubAllGlobals())
const paint = () => {
  const queued = [...frames.values()]
  frames.clear()
  queued.forEach((run) => run(0))
}

describe('transient node positions', () => {
  it('coalesces samples to one notification per node per paint; unrelated nodes stay asleep', () => {
    const store = createNodePositionStore()
    const changed = vi.fn()
    const untouched = vi.fn()
    store.subscribe('a', changed)
    store.subscribe('b', untouched)
    store.preview('a', 10, 20)
    store.preview('a', 30, 40)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(changed).not.toHaveBeenCalled()
    expect(store.get('a')).toBeUndefined()
    paint()
    expect(store.get('a')).toEqual({ x: 30, y: 40 })
    expect(changed).toHaveBeenCalledTimes(1)
    expect(untouched).not.toHaveBeenCalled()
    const snapshot = store.get('a')
    store.preview('a', 30, 40)
    paint()
    expect(store.get('a')).toBe(snapshot)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('finishes with the latest sample even before the frame runs, and clears the preview', () => {
    const store = createNodePositionStore()
    store.preview('a', 10, 20)
    paint()
    store.preview('a', 50, 60)
    expect(store.finish('a')).toEqual({ x: 50, y: 60 })
    expect(store.get('a')).toBeUndefined()
    expect(frames.size).toBe(0)
    paint()
    expect(store.get('a')).toBeUndefined()
  })

  it('cleans pending callbacks and previews on disposal', () => {
    const store = createNodePositionStore()
    const changed = vi.fn()
    const unsubscribe = store.subscribe('a', changed)
    store.preview('a', 10, 20)
    paint()
    store.preview('a', 30, 40)
    store.dispose()
    expect(store.get('a')).toBeUndefined()
    expect(frames.size).toBe(0)
    expect(changed).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.preview('a', 30, 40)
    paint()
    expect(changed).toHaveBeenCalledTimes(2)
    store.dispose()
  })
})

function Draggable({
  onMove,
  zoom = 2,
}: {
  onMove: (id: string, x: number, y: number) => void
  zoom?: number
}) {
  const node = { id: 'a', x: 10, y: 20 }
  const position = useNodePosition(node.id, node)
  const drag = useNodeDrag(node, () => zoom, onMove)
  return (
    <div data-testid="node" {...drag}>
      {position.x},{position.y}
      <span data-testid="child" />
    </div>
  )
}

describe('node drag gestures', () => {
  it('previews in board coordinates and commits only once on release', () => {
    const store = createNodePositionStore()
    const checkpoint = vi.fn()
    const onMove = vi.fn()
    render(
      <NodeDragContext.Provider value={{ positions: store, checkpoint }}>
        <Draggable onMove={onMove} />
      </NodeDragContext.Provider>,
    )
    const node = screen.getByTestId('node')
    node.setPointerCapture = vi.fn()
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerMove(node, { pointerId: 2, clientX: 900, clientY: 900 })
    act(paint)
    expect(node).toHaveTextContent('30,30')
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 160, clientY: 140 })
    fireEvent.pointerUp(node, { pointerId: 1 })
    fireEvent.lostPointerCapture(node, { pointerId: 1 })
    expect(onMove.mock.calls).toEqual([['a', 40, 40]])
    expect(checkpoint).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
  })

  it.each(['pointerCancel', 'lostPointerCapture'] as const)(
    'rolls back on %s without committing',
    (event) => {
      const store = createNodePositionStore()
      const onMove = vi.fn()
      render(
        <NodeDragContext.Provider value={{ positions: store, checkpoint: () => {} }}>
          <Draggable onMove={onMove} />
        </NodeDragContext.Provider>,
      )
      const node = screen.getByTestId('node')
      fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(node, { pointerId: 1, clientX: 40, clientY: 20 })
      act(paint)
      fireEvent[event](node, { pointerId: 1 })
      expect(node).toHaveTextContent('10,20')
      expect(onMove).not.toHaveBeenCalled()
      fireEvent.pointerUp(node, { pointerId: 1 })
      expect(onMove).not.toHaveBeenCalled()
    },
  )

  it('previews every selected node and commits them together; child capture loss does not cancel the owner', () => {
    const store = createNodePositionStore()
    const onMove = vi.fn()
    const commit = vi.fn()
    render(
      <NodeDragContext.Provider
        value={{
          positions: store,
          checkpoint: () => {},
          commit,
          participants: () => [
            { id: 'a', x: 10, y: 20 },
            { id: 'b', x: 100, y: 200 },
          ],
        }}
      >
        <Draggable onMove={onMove} />
      </NodeDragContext.Provider>,
    )
    const node = screen.getByTestId('node')
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 40, clientY: 20 })
    act(paint)
    expect(store.get('a')).toEqual({ x: 30, y: 30 })
    expect(store.get('b')).toEqual({ x: 120, y: 210 })
    fireEvent.lostPointerCapture(screen.getByTestId('child'), { pointerId: 1 })
    expect(store.get('b')).toEqual({ x: 120, y: 210 })
    fireEvent.pointerUp(node, { pointerId: 1 })
    expect(commit).toHaveBeenCalledTimes(1)
    expect([...commit.mock.calls[0]![0]]).toEqual([
      ['a', { x: 30, y: 30 }],
      ['b', { x: 120, y: 210 }],
    ])
    expect(onMove).not.toHaveBeenCalled()
    expect(store.get('a')).toBeUndefined()
    expect(store.get('b')).toBeUndefined()
  })

  it('invalidates a whole gesture when its preview store is cleared', () => {
    const store = createNodePositionStore()
    const commit = vi.fn()
    render(
      <NodeDragContext.Provider value={{ positions: store, checkpoint: () => {}, commit }}>
        <Draggable onMove={() => {}} />
      </NodeDragContext.Provider>,
    )
    const node = screen.getByTestId('node')
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 40, clientY: 20 })
    act(paint)
    act(() => store.dispose())
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 80, clientY: 40 })
    fireEvent.pointerUp(node, { pointerId: 1 })
    expect(commit).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    expect(node).toHaveTextContent('10,20')
  })

  it('drops queued work when the node unmounts', () => {
    const store = createNodePositionStore()
    const onMove = vi.fn()
    const { unmount } = render(
      <NodeDragContext.Provider value={{ positions: store, checkpoint: () => {} }}>
        <Draggable onMove={onMove} />
      </NodeDragContext.Provider>,
    )
    const node = screen.getByTestId('node')
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 40, clientY: 20 })
    unmount()
    expect(frames.size).toBe(0)
    expect(onMove).not.toHaveBeenCalled()
  })
})
