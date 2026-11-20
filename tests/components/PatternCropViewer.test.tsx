import { fireEvent, render, screen } from '@testing-library/react'
import { PatternCropViewer } from '../../src/components/CanvasPage/PatternCropViewer'
import type { CropRect } from '../../src/types'

const CROP: CropRect = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function setup(crop: CropRect = CROP) {
  const onChange = vi.fn()
  const view = render(<PatternCropViewer image="/images/x.png" crop={crop} onChange={onChange} />)
  const stage = view.container.querySelector<HTMLElement>('.pattern-crop-stage')
  if (!stage) throw new Error('missing stage')
  const size = vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(200, 100))
  return { ...view, onChange, stage, size }
}

const lastCrop = (onChange: ReturnType<typeof vi.fn>): CropRect =>
  onChange.mock.calls.at(-1)?.[0] as CropRect

describe('PatternCropViewer', () => {
  it('shows the full-image default crop', () => {
    setup({ x: 0, y: 0, width: 1, height: 1 })
    const box = screen.getByLabelText('Crop region')
    expect(box).toHaveStyle({ left: '0%', top: '0%', width: '100%', height: '100%' })
    expect(screen.getByLabelText('viewer zoom')).toHaveTextContent('100%')
  })

  it('resizes from corners and edges, clamped inside the image', () => {
    const { onChange } = setup()
    fireEvent.pointerDown(screen.getByLabelText('crop handle se'), {
      button: 0,
      clientX: 100,
      clientY: 50,
    })
    fireEvent.pointerMove(window, { clientX: 120, clientY: 60 })
    fireEvent.pointerUp(window)
    const grown = lastCrop(onChange)
    expect(grown.width).toBeCloseTo(0.6)
    expect(grown.height).toBeCloseTo(0.6)

    onChange.mockClear()
    fireEvent.pointerDown(screen.getByLabelText('crop handle nw'), {
      button: 0,
      clientX: 20,
      clientY: 10,
    })
    // Far past the top-left: clamped at 0, the opposite edge stays put.
    fireEvent.pointerMove(window, { clientX: -100, clientY: -100 })
    fireEvent.pointerUp(window)
    const clamped = lastCrop(onChange)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(0)
    expect(clamped.width).toBeCloseTo(0.6)
    expect(clamped.height).toBeCloseTo(0.6)

    onChange.mockClear()
    fireEvent.pointerDown(screen.getByLabelText('crop handle e'), {
      button: 0,
      clientX: 100,
      clientY: 50,
    })
    fireEvent.pointerMove(window, { clientX: 500, clientY: 50 })
    fireEvent.pointerUp(window)
    const edge = lastCrop(onChange)
    expect(edge.x + edge.width).toBeCloseTo(1)
    expect(edge.height).toBeCloseTo(0.5)
  })

  it('moves the crop by dragging it, inside the image', () => {
    const { onChange } = setup()
    fireEvent.pointerDown(screen.getByLabelText('Crop region'), {
      button: 0,
      clientX: 40,
      clientY: 20,
    })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 30 })
    fireEvent.pointerUp(window)
    const moved = lastCrop(onChange)
    expect(moved.x).toBeCloseTo(0.2)
    expect(moved.y).toBeCloseTo(0.2)
    expect(moved.width).toBeCloseTo(0.5)
    expect(moved.height).toBeCloseTo(0.5)

    onChange.mockClear()
    fireEvent.pointerDown(screen.getByLabelText('Crop region'), {
      button: 0,
      clientX: 40,
      clientY: 20,
    })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400 })
    fireEvent.pointerUp(window)
    const clamped = lastCrop(onChange)
    expect(clamped.x).toBeCloseTo(0.5)
    expect(clamped.y).toBeCloseTo(0.5)
  })

  it('resizes correctly at 8× zoom (the stage is larger on screen)', () => {
    const { onChange, stage, size } = setup()
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByLabelText('zoom in'))
    expect(screen.getByLabelText('viewer zoom')).toHaveTextContent('800%')
    size.mockReturnValue(rect(1600, 800))
    void stage

    fireEvent.pointerDown(screen.getByLabelText('crop handle se'), {
      button: 0,
      clientX: 0,
      clientY: 0,
    })
    fireEvent.pointerMove(window, { clientX: 160, clientY: 80 })
    fireEvent.pointerUp(window)
    const grown = lastCrop(onChange)
    expect(grown.width).toBeCloseTo(0.6)
    expect(grown.height).toBeCloseTo(0.6)
  })

  it('zooms (buttons, slider, wheel) and pans without changing the crop', () => {
    const { onChange, stage, size } = setup()
    fireEvent.click(screen.getByLabelText('zoom in'))
    expect(screen.getByLabelText('viewer zoom')).toHaveTextContent('125%')
    fireEvent.change(screen.getByLabelText('zoom'), { target: { value: '4' } })
    expect(screen.getByLabelText('viewer zoom')).toHaveTextContent('400%')
    fireEvent.wheel(screen.getByLabelText('Pattern crop viewer'), { deltaY: -100 })
    expect(screen.getByLabelText('viewer zoom')).not.toHaveTextContent('400%')

    // Panning: a middle-button drag on the image (a full crop's box, or alt-drag, too).
    size.mockReturnValue(rect(800, 400))
    fireEvent.pointerDown(stage, { button: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 80, clientY: 70 })
    fireEvent.pointerUp(window)
    fireEvent.click(screen.getByLabelText('fit'))
    expect(screen.getByLabelText('viewer zoom')).toHaveTextContent('100%')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('is isolated from the workspace canvas (no pan start, own wheel)', () => {
    setup()
    const viewer = screen.getByLabelText('Pattern crop viewer')
    expect(viewer).toHaveAttribute('data-no-pan')
    expect(viewer).toHaveAttribute('data-own-wheel')
    // Badge on the workspace: it must not start a canvas pan.
    expect(screen.getByLabelText('Crop region').closest('[data-no-pan]')).toBe(viewer)
  })
})
