import { fireEvent, render, screen } from '@testing-library/react'
import {
  CanvasComposition,
  type CanvasCompositionProps,
} from '../../src/components/CanvasPage/CanvasComposition'

const node = {
  id: 'composition-1',
  name: 'Composition 1',
  x: 100,
  y: 200,
  frame: { width: 800, height: 600 },
  image: { x: 10, y: 20, width: 300, height: 200 },
}

function setup(overrides: Partial<CanvasCompositionProps> = {}) {
  const props: CanvasCompositionProps = {
    node,
    selected: true,
    getZoom: () => 2,
    imageUrl: 'https://example.test/fake.png',
    connected: false,
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onInputDown: vi.fn(),
    onResize: vi.fn(),
    onImageChange: vi.fn(),
    ...overrides,
  }
  const view = render(<CanvasComposition {...props} />)
  return { props, ...view }
}

describe('CanvasComposition', () => {
  it('shows image and selected controls only when applicable', () => {
    const { container, rerender, props } = setup({ selected: false })
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/fake.png')
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Export PNG' })).not.toBeInTheDocument()
    rerender(<CanvasComposition {...props} selected />)
    expect(screen.getAllByRole('slider')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeInTheDocument()
    rerender(<CanvasComposition {...props} selected imageUrl={undefined} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getAllByRole('slider')).toHaveLength(4)
  })

  it('moves the composition at canvas zoom and selects it', () => {
    const { props } = setup()
    const composition = screen.getByLabelText('Composition 1')
    fireEvent.pointerDown(composition, { button: 0, pointerId: 1, clientX: 20, clientY: 40 })
    fireEvent.pointerMove(composition, { pointerId: 1, clientX: 80, clientY: 60 })
    fireEvent.pointerUp(composition, { pointerId: 1 })
    expect(props.onSelect).toHaveBeenCalledWith(node.id, false, true)
    expect(props.onMove).toHaveBeenCalledWith(node.id, 130, 210)
  })

  it('moves the image at zoom without moving the composition and stops on pointer up', () => {
    const { container, props } = setup()
    const image = container.querySelector('[data-composition-image]')!
    fireEvent.pointerDown(image, { button: 0, pointerId: 2, clientX: 50, clientY: 40 })
    fireEvent.pointerMove(image, { pointerId: 9, clientX: 90, clientY: 60 })
    expect(props.onImageChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(image, { pointerId: 2, clientX: 90, clientY: 60 })
    expect(props.onImageChange).toHaveBeenCalledWith(node.id, { ...node.image, x: 30, y: 30 })
    expect(props.onMove).not.toHaveBeenCalled()
    fireEvent.pointerUp(image, { pointerId: 2 })
    fireEvent.pointerMove(image, { pointerId: 2, clientX: 120, clientY: 80 })
    expect(props.onImageChange).toHaveBeenCalledTimes(1)
  })

  it('resizes an image corner using zoom and anchors the opposite corner', () => {
    const { props } = setup()
    const handle = screen.getByRole('slider', { name: 'resize image top-left' })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 3, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 140, clientY: 120 })
    expect(props.onImageChange).toHaveBeenCalledWith(node.id, {
      x: 30,
      y: 30,
      width: 280,
      height: 190,
    })
    expect(props.onMove).not.toHaveBeenCalled()
    fireEvent.pointerCancel(handle, { pointerId: 3 })
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 160, clientY: 140 })
    expect(props.onImageChange).toHaveBeenCalledTimes(1)
  })

  it('resizes the frame at zoom without changing the image', () => {
    const { props } = setup()
    const handle = screen.getByRole('slider', { name: 'resize left' })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 4, clientX: 100, clientY: 0 })
    fireEvent.pointerMove(handle, { pointerId: 4, clientX: 180, clientY: 0 })
    expect(props.onResize).toHaveBeenCalledWith(node.id, {
      x: 140,
      y: 200,
      width: 760,
      height: 600,
    })
    expect(props.onImageChange).not.toHaveBeenCalled()
    expect(props.onMove).not.toHaveBeenCalled()
  })

  it('shift-selects the image without starting a move and ignores invalid zoom', () => {
    const { container, props, rerender } = setup()
    const image = container.querySelector('[data-composition-image]')!
    fireEvent.pointerDown(image, { button: 0, pointerId: 5, shiftKey: true })
    fireEvent.pointerMove(image, { pointerId: 5, clientX: 100 })
    expect(props.onSelect).toHaveBeenCalledWith(node.id, true, true)
    expect(props.onImageChange).not.toHaveBeenCalled()
    rerender(<CanvasComposition {...props} getZoom={() => 0} />)
    fireEvent.pointerDown(image, { button: 0, pointerId: 6 })
    fireEvent.pointerMove(image, { pointerId: 6, clientX: 100 })
    expect(props.onImageChange).not.toHaveBeenCalled()
  })
})
