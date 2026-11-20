import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })

function insert(name: string, x = 120, y = 120) {
  fireEvent.contextMenu(canvas(), { clientX: x, clientY: y })
  fireEvent.click(screen.getByRole('menuitem', { name }))
}

async function insertRepeat() {
  insert('insert repeat')
  return screen.findByLabelText('repeat 1')
}

const repeatControls = () => document.querySelector<HTMLElement>('.repeat-controls')!

function insertText(index: number, text: string) {
  insert('insert text')
  const node = screen.getByRole('group', { name: `text ${index}` })
  fireEvent.change(within(node).getByRole('textbox'), { target: { value: text } })
  return node
}

function link(node: HTMLElement, name: string, repeat: HTMLElement, pointerId: number) {
  fireEvent.pointerDown(within(node).getByLabelText(name), { button: 0, pointerId })
  fireEvent.pointerUp(within(repeat).getByLabelText('repeat 1 input'), { pointerId })
}

describe('repeat artboard', () => {
  it('inserts, links the last text, mutes it and selects the repeat like another artboard', async () => {
    render(<CanvasPage tools={null} />)
    const repeat = await insertRepeat()
    expect(repeat).toHaveAttribute('data-repeat-text', '')
    expect(repeat).toHaveAttribute('data-background', '#ffffff')
    expect(repeat.querySelector('canvas')).toBeInTheDocument()
    // A shared source render, not one 3D context per copy.
    expect(repeat.querySelectorAll('.three-view')).toHaveLength(1)

    const first = insertText(1, 'FIRST')
    link(first, 'text 1 output', repeat, 1)
    expect(repeat).toHaveAttribute('data-repeat-text', 'FIRST')
    const second = insertText(2, 'SECOND')
    link(second, 'text 2 output', repeat, 2)
    // The last connected eligible text wins.
    expect(repeat).toHaveAttribute('data-repeat-text', 'SECOND')

    // Muting the last text falls back to the earlier connection; unmuting restores it.
    fireEvent.pointerDown(second, { button: 0, metaKey: true })
    fireEvent.click(second, { metaKey: true })
    expect(repeat).toHaveAttribute('data-repeat-text', 'FIRST')
    fireEvent.click(second, { metaKey: true })
    expect(repeat).toHaveAttribute('data-repeat-text', 'SECOND')

    fireEvent.pointerDown(repeat)
    expect(repeat).toHaveAttribute('data-selected')
    expect(screen.getByRole('slider', { name: 'tile scale' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'column width' })).toHaveValue('375')
    expect(screen.getByLabelText('font')).toHaveValue('PP Mori')
    expect(within(repeatControls()).getByLabelText('background')).toHaveValue('#ffffff')

    fireEvent.pointerDown(repeat)
    fireEvent.contextMenu(repeat, { clientX: 120, clientY: 120 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'disconnect inputs' }))
    expect(repeat).toHaveAttribute('data-repeat-text', '')
  })

  it('updates typography, spacing, offset and background; drags the artwork and resizes the frame', async () => {
    render(<CanvasPage tools={null} />)
    const repeat = await insertRepeat()
    fireEvent.pointerDown(repeat)

    fireEvent.change(screen.getByRole('slider', { name: 'size' }), { target: { value: '80' } })
    expect(repeat).toHaveAttribute('data-font-size', '80')
    fireEvent.change(screen.getByRole('slider', { name: 'tile scale' }), {
      target: { value: '0.5' },
    })
    expect(repeat).toHaveAttribute('data-scale', '0.5')
    const pitch = Number(repeat.getAttribute('data-pitch-x'))
    expect(pitch).toBeGreaterThan(0)
    fireEvent.change(screen.getByRole('slider', { name: 'spacing x' }), {
      target: { value: '-1000' },
    })
    expect(Number(repeat.getAttribute('data-pitch-x'))).toBeGreaterThan(0)

    fireEvent.change(within(repeatControls()).getByLabelText('background'), {
      target: { value: '#ff0000' },
    })
    expect(repeat).toHaveAttribute('data-background', '#ff0000')

    // Dragging the artwork offsets the whole grid, not the node.
    const artwork = repeat.querySelector<HTMLElement>('[data-repeat-artwork]')!
    const left = repeat.style.left
    fireEvent.pointerDown(artwork, { button: 0, pointerId: 10, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(artwork, { pointerId: 10, clientX: 60, clientY: 30 })
    fireEvent.pointerUp(artwork, { pointerId: 10 })
    expect(repeat).toHaveAttribute('data-offset-x', '40')
    expect(repeat).toHaveAttribute('data-offset-y', '10')
    expect(repeat.style.left).toBe(left)

    // The frame handle resizes the repeat frame (and its clip) like other artboards.
    const handle = within(repeat).getByLabelText('resize right')
    fireEvent.pointerDown(handle, { button: 0, pointerId: 11, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 200, clientY: 100 })
    fireEvent.pointerUp(window, { pointerId: 11 })
    expect(Number(repeat.getAttribute('data-frame-width'))).toBeGreaterThan(1920)
  })

  it('duplicates, deletes and undoes like the existing artboards, with its connections', async () => {
    render(<CanvasPage tools={null} />)
    const repeat = await insertRepeat()
    const text = insertText(1, 'COPY')
    link(text, 'text 1 output', repeat, 1)
    fireEvent.pointerDown(repeat)
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    const duplicate = await screen.findByLabelText('repeat 2')
    expect(duplicate).toBeInTheDocument()
    expect(canvas().querySelectorAll('.node-links path')).toHaveLength(1)
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(screen.queryByLabelText('repeat 2')).toBeNull()

    fireEvent.pointerDown(repeat)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.queryByLabelText('repeat 1')).toBeNull()
  })
})

describe('repeat shared modifiers', () => {
  it('applies shape, material, lighting and surface nodes to every repeated trophy', async () => {
    render(<CanvasPage tools={null} />)
    const repeat = await insertRepeat()

    insert('insert shape')
    const shape = screen.getByRole('group', { name: 'shape 1' })
    link(shape, 'shape 1 output', repeat, 20)
    expect(repeat).toHaveAttribute('data-shape', 'linked')
    const source = repeat.querySelector<HTMLElement>('.repeat-artboard-source .artboard')!
    expect(source).toHaveAttribute('data-top-radius', '200')
    fireEvent.change(within(shape).getByRole('slider', { name: 'top radius' }), {
      target: { value: '333' },
    })
    expect(source).toHaveAttribute('data-top-radius', '333')
    // Muting restores the artboard's own shape, and the node keeps its value.
    fireEvent.pointerDown(shape, { button: 0, metaKey: true })
    fireEvent.click(shape, { metaKey: true })
    expect(source).toHaveAttribute('data-top-radius', '16')
    fireEvent.click(shape, { metaKey: true })
    expect(source).toHaveAttribute('data-top-radius', '333')
    expect(within(shape).getByRole('slider', { name: 'top radius' })).toHaveValue('333')

    insert('insert material')
    const material = screen.getByRole('group', { name: 'material 1' })
    link(material, 'material 1 output', repeat, 21)
    expect(repeat).toHaveAttribute('data-material-palette', 'studio')
    fireEvent.click(within(material).getByRole('radio', { name: 'gold' }))
    expect(repeat).toHaveAttribute('data-material-palette', 'gold')

    for (const [index, name] of ['lighting', 'twist', 'etch', 'texture', 'pattern'].entries()) {
      insert(`insert ${name}`)
      const node = screen.getByRole('group', { name: `${name} 1` })
      link(node, `${name} 1 output`, repeat, 30 + index)
    }
    expect(repeat).toHaveAttribute('data-twists', '1')
    expect(repeat).toHaveAttribute('data-etches', '1')
    expect(repeat).toHaveAttribute('data-textures', '1')
    // Patterns still generating are linked (the artboard keeps the last good map).
    expect(within(repeat).getByLabelText('repeat 1 input')).toHaveAttribute('data-connected')
  })
})

it('moves the artboard, and undo restores its layout settings', async () => {
  render(<CanvasPage tools={null} />)
  const repeat = await insertRepeat()
  const beforeLeft = parseFloat(repeat.style.left)
  fireEvent.pointerDown(repeat, { button: 0, pointerId: 40, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { pointerId: 40, clientX: 70, clientY: 40 })
  fireEvent.pointerUp(window, { pointerId: 40 })
  const movedLeft = parseFloat(repeat.style.left)
  expect(movedLeft).toBeCloseTo(beforeLeft + 60)

  fireEvent.pointerDown(repeat)
  fireEvent.change(within(repeatControls()).getByLabelText('background'), {
    target: { value: '#ff0000' },
  })
  expect(repeat).toHaveAttribute('data-background', '#ff0000')
  fireEvent.change(screen.getByRole('slider', { name: 'tile scale' }), {
    target: { value: '0.4' },
  })
  expect(repeat).toHaveAttribute('data-scale', '0.4')
  fireEvent.keyDown(window, { key: 'z', metaKey: true })
  expect(repeat).toHaveAttribute('data-scale', '1')
  expect(repeat).toHaveAttribute('data-background', '#ffffff')
  expect(parseFloat(repeat.style.left)).toBeCloseTo(movedLeft)
  fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true })
  expect(repeat).toHaveAttribute('data-scale', '0.4')
})
