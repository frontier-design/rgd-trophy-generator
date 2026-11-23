import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { SelectionMarquee } from '../../src/components/CanvasPage/SelectionMarquee'

const select = vi.fn()
const clear = vi.fn()
let frames: Map<number, FrameRequestCallback>
let next: number

function Fixture() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} data-testid="canvas">
      <div data-scene-node data-scene-id="scene">
        <span>scene</span>
      </div>
      <div data-canvas-node data-node-id="node">
        <div className="node-card">card</div>
      </div>
      <button>control</button>
      <SelectionMarquee canvasRef={ref} onSelect={select} onClear={clear} />
    </div>
  )
}
function box(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}
function setup() {
  const view = render(<Fixture />)
  const canvas = screen.getByTestId('canvas')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(box(100, 50, 500, 400))
  vi.spyOn(canvas.querySelector('[data-scene-node]')!, 'getBoundingClientRect').mockReturnValue(
    box(150, 100, 40, 40),
  )
  vi.spyOn(canvas.querySelector('.node-card')!, 'getBoundingClientRect').mockReturnValue(
    box(210, 110, 40, 40),
  )
  return { canvas, ...view }
}
function flush() {
  const pending = [...frames.values()]
  frames.clear()
  act(() => pending.forEach((callback) => callback(0)))
}
beforeEach(() => {
  select.mockReset()
  clear.mockReset()
  frames = new Map()
  next = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = next++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => vi.unstubAllGlobals())

describe('SelectionMarquee', () => {
  it('a quick flick selects up to where it was released, even with no move in between', () => {
    const { canvas } = setup()
    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 4,
      shiftKey: true,
      clientX: 260,
      clientY: 160,
    })
    fireEvent.pointerUp(canvas, { pointerId: 4, clientX: 130, clientY: 80 })
    expect(select).toHaveBeenCalledWith(['scene', 'node'])
  })

  it('reserves shift gestures and selects screen-space scene and card bounds in reverse', () => {
    const { canvas } = setup()
    const pan = vi.fn()
    canvas.addEventListener('pointerdown', pan)
    const down = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      shiftKey: true,
      clientX: 260,
      clientY: 160,
    })
    fireEvent(canvas, down)
    expect(down.defaultPrevented).toBe(true)
    expect(pan).not.toHaveBeenCalled()
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 90 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 130, clientY: 80 })
    expect(frames.size).toBe(1)
    flush()
    expect(screen.getByLabelText('Selection rectangle')).toHaveStyle({
      left: '30px',
      top: '30px',
      width: '130px',
      height: '80px',
      pointerEvents: 'none',
    })
    expect(select).not.toHaveBeenCalled()
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(select).toHaveBeenCalledWith(['scene', 'node'])
    expect(screen.queryByLabelText('Selection rectangle')).toBeNull()
  })
  it.each(['pointerCancel', 'lostPointerCapture', 'blur', 'escape'])(
    'cancels on %s and discards queued frames',
    (kind) => {
      const { canvas } = setup()
      fireEvent.pointerDown(canvas, {
        button: 0,
        pointerId: 2,
        shiftKey: true,
        clientX: 130,
        clientY: 80,
      })
      fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 250, clientY: 150 })
      if (kind === 'pointerCancel') fireEvent.pointerCancel(canvas, { pointerId: 2 })
      else if (kind === 'lostPointerCapture')
        fireEvent(canvas, new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 2 }))
      else if (kind === 'blur') fireEvent.blur(window)
      else fireEvent.keyDown(window, { key: 'Escape' })
      expect(frames.size).toBe(0)
      fireEvent.pointerUp(canvas, { pointerId: 2 })
      expect(select).not.toHaveBeenCalled()
      expect(clear).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Selection rectangle')).toBeNull()
    },
  )
  it('does not intercept ordinary or middle presses; clears clicks but not pans', () => {
    const { canvas } = setup()
    const pan = vi.fn()
    canvas.addEventListener('pointerdown', pan)
    const down = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX: 120,
      clientY: 70,
    })
    fireEvent(canvas, down)
    expect(down.defaultPrevented).toBe(false)
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 122, clientY: 70 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(clear).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 120, clientY: 70 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 140, clientY: 70 })
    fireEvent.pointerUp(canvas, { pointerId: 2 })
    fireEvent.pointerDown(canvas, { button: 1, pointerId: 3, shiftKey: true })
    fireEvent.pointerUp(canvas, { pointerId: 3 })
    expect(pan).toHaveBeenCalledTimes(3)
    expect(clear).toHaveBeenCalledTimes(1)
  })
  it('ignores excluded targets', () => {
    setup()
    fireEvent.pointerDown(screen.getByText('scene'), { button: 0, pointerId: 1, shiftKey: true })
    fireEvent.pointerUp(window, { pointerId: 1 })
    fireEvent.pointerDown(screen.getByText('control'), { button: 0, pointerId: 2 })
    fireEvent.pointerUp(window, { pointerId: 2 })
    expect(select).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })
})
