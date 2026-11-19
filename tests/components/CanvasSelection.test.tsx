import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'
import { flushAutosaves, readSaved } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })
const node = (name: string) => screen.getByRole('group', { name })

async function insertScene(x = 200, y = 150) {
  fireEvent.contextMenu(canvas(), { clientX: x, clientY: y })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
  return screen.findByLabelText(/^scene \d+$/)
}

function insertModifier(kind: 'twist' | 'etch', x = 40, y = 40) {
  fireEvent.contextMenu(canvas(), { clientX: x, clientY: y })
  fireEvent.click(screen.getByRole('menuitem', { name: `insert ${kind}` }))
  return node(
    `${kind} ${screen.getAllByRole('group', { name: new RegExp(`^${kind} \\d+$`) }).length}`,
  )
}

function clickNode(element: Element, options: Record<string, unknown> = {}) {
  const pointerId = Math.random()
  fireEvent.pointerDown(element, { button: 0, pointerId, ...options })
  fireEvent.pointerUp(element, { button: 0, pointerId, ...options })
}

function shiftClick(element: Element) {
  const pointerId = Math.random()
  fireEvent.pointerDown(element, { button: 0, pointerId, shiftKey: true })
  fireEvent.pointerUp(element, { button: 0, pointerId, shiftKey: true })
}

function link(from: Element, to: Element, pointerId = 90) {
  fireEvent.pointerDown(from, { button: 0, pointerId })
  fireEvent.pointerMove(window, { pointerId, clientX: 300, clientY: 300 })
  fireEvent.pointerUp(to, { pointerId })
}

describe('CanvasPage multiselection', () => {
  it('shift-click toggles nodes, while an ordinary click and pointerup collapses the group', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    insertModifier('twist')
    const twist = node('twist 1')

    shiftClick(scene)
    expect(scene).toHaveAttribute('data-selected')
    expect(twist.parentElement).toHaveAttribute('data-selected')
    shiftClick(twist)
    expect(twist.parentElement).not.toHaveAttribute('data-selected')
    expect(scene).toHaveAttribute('data-selected')
    shiftClick(twist)
    expect(twist.parentElement).toHaveAttribute('data-selected')

    clickNode(scene)
    expect(scene).toHaveAttribute('data-selected')
    expect(twist.parentElement).not.toHaveAttribute('data-selected')
  })

  it('dragging one selected node moves the whole mixed scene/modifier group, in one undo step', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    insertModifier('twist')
    const twist = node('twist 1')
    shiftClick(scene)
    const master = node('master').parentElement!
    shiftClick(node('master'))
    const masterBefore = { left: parseFloat(master.style.left), top: parseFloat(master.style.top) }
    const before = {
      left: parseFloat(twist.parentElement!.style.left),
      top: parseFloat(twist.parentElement!.style.top),
    }

    fireEvent.pointerDown(scene, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(scene, { pointerId: 1, clientX: 60, clientY: 30 })
    fireEvent.pointerUp(scene, { pointerId: 1 })
    expect(parseFloat(twist.parentElement!.style.left)).toBeCloseTo(before.left + 50)
    expect(parseFloat(twist.parentElement!.style.top)).toBeCloseTo(before.top + 20)
    expect(parseFloat(master.style.left)).toBeCloseTo(masterBefore.left + 50)
    expect(parseFloat(master.style.top)).toBeCloseTo(masterBefore.top + 20)

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(parseFloat(twist.parentElement!.style.left)).toBeCloseTo(before.left)
    expect(parseFloat(twist.parentElement!.style.top)).toBeCloseTo(before.top)
    expect(parseFloat(master.style.left)).toBeCloseTo(masterBefore.left)
    expect(parseFloat(master.style.top)).toBeCloseTo(masterBefore.top)
    expect(scene).toBeInTheDocument()
    expect(twist).toBeInTheDocument()
  })

  it('deleting a mixed selection removes its incident links but never removes master', async () => {
    const { container } = render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    insertModifier('twist')
    const twist = node('twist 1')
    link(
      within(twist).getByLabelText('twist 1 output'),
      within(scene).getByLabelText('scene 1 input'),
    )
    expect(container.querySelectorAll('.node-links path')).toHaveLength(1)

    shiftClick(scene)
    shiftClick(screen.getByRole('group', { name: 'master' }))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.queryByLabelText('scene 1')).toBeNull()
    expect(screen.queryByRole('group', { name: 'twist 1' })).toBeNull()
    expect(screen.getByRole('group', { name: 'master' })).toBeInTheDocument()
    expect(container.querySelectorAll('.node-links path')).toHaveLength(0)
  })

  it('Ctrl+D duplicates a selected scene and modifier with internal links only, in one undo step', async () => {
    const { container } = render(<CanvasPage tools={null} />)
    const scene1 = await insertScene(200, 150)
    await insertScene(700, 150)
    insertModifier('etch')
    const etch = node('etch 1')
    link(
      within(etch).getByLabelText('etch 1 output'),
      within(scene1).getByLabelText('scene 1 input'),
      11,
    )
    link(within(etch).getByLabelText('etch 1 output'), screen.getByLabelText('scene 2 input'), 12)
    expect(container.querySelectorAll('.node-links path')).toHaveLength(2)

    shiftClick(scene1)
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    expect(await screen.findByLabelText('scene 3')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'etch 2' })).toBeInTheDocument()
    expect(container.querySelectorAll('.node-links path')).toHaveLength(3)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(screen.queryByLabelText('scene 3')).toBeNull()
    expect(screen.queryByRole('group', { name: 'etch 2' })).toBeNull()
    expect(container.querySelectorAll('.node-links path')).toHaveLength(2)
  })

  it('copy/paste preserves relative positions and internal links, and allocates fresh IDs after undo', async () => {
    const { container } = render(<CanvasPage tools={null} />)
    const scene = await insertScene(200, 150)
    insertModifier('twist', 80, 80)
    const twist = node('twist 1')
    link(
      within(twist).getByLabelText('twist 1 output'),
      within(scene).getByLabelText('scene 1 input'),
    )
    const delta = parseFloat(scene.style.left) - parseFloat(twist.parentElement!.style.left)

    shiftClick(scene)
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    const copyScene = await screen.findByLabelText('scene 2')
    const copyTwist = node('twist 2')
    expect(
      parseFloat(copyScene.style.left) - parseFloat(copyTwist.parentElement!.style.left),
    ).toBeCloseTo(delta)
    expect(container.querySelectorAll('.node-links path')).toHaveLength(2)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(screen.queryByLabelText('scene 2')).toBeNull()
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(await screen.findByLabelText('scene 3')).toBeInTheDocument()
    expect(node('twist 3')).toBeInTheDocument()
  })

  it('adds marquee intersections without panning, while ordinary background drags keep the selection', async () => {
    const { container } = render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    const twist = insertModifier('twist')
    const etch = insertModifier('etch')
    const bounds = (left: number, top: number, width: number, height: number) =>
      ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect
    vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue(bounds(300, 200, 100, 100))
    vi.spyOn(twist, 'getBoundingClientRect').mockReturnValue(bounds(100, 100, 150, 100))
    vi.spyOn(etch, 'getBoundingClientRect').mockReturnValue(bounds(500, 500, 100, 100))
    const world = container.querySelector<HTMLElement>('.infinite-canvas-world')!
    const before = world.style.transform
    fireEvent.pointerDown(canvas(), {
      button: 0,
      pointerId: 51,
      shiftKey: true,
      clientX: 50,
      clientY: 50,
    })
    expect(canvas()).not.toHaveAttribute('data-panning')
    fireEvent.pointerMove(canvas(), { pointerId: 51, clientX: 260, clientY: 250 })
    fireEvent.pointerUp(canvas(), { pointerId: 51 })
    expect(world.style.transform).toBe(before)
    expect(twist.parentElement).toHaveAttribute('data-selected')
    expect(etch.parentElement).toHaveAttribute('data-selected')
    expect(scene).not.toHaveAttribute('data-selected')

    // Reverse direction, adding a scene without dropping the original two nodes.
    fireEvent.pointerDown(canvas(), {
      button: 0,
      pointerId: 52,
      shiftKey: true,
      clientX: 450,
      clientY: 350,
    })
    fireEvent.pointerMove(canvas(), { pointerId: 52, clientX: 290, clientY: 180 })
    fireEvent.pointerUp(canvas(), { pointerId: 52 })
    expect(scene).toHaveAttribute('data-selected')
    expect(twist.parentElement).toHaveAttribute('data-selected')
    expect(etch.parentElement).toHaveAttribute('data-selected')
    fireEvent.pointerDown(canvas(), { button: 0, pointerId: 53, clientX: 1000, clientY: 800 })
    fireEvent.pointerMove(canvas(), { pointerId: 53, clientX: 1020, clientY: 850 })
    fireEvent.pointerUp(canvas(), { pointerId: 53 })
    expect(world.style.transform).not.toBe(before)
    expect(scene).toHaveAttribute('data-selected')
    expect(twist.parentElement).toHaveAttribute('data-selected')
    clickNode(canvas())
    expect(scene).not.toHaveAttribute('data-selected')
    expect(twist.parentElement).not.toHaveAttribute('data-selected')
    expect(etch.parentElement).not.toHaveAttribute('data-selected')
  })

  it('keeps selection out of saved documents and undo history', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    clickNode(scene) // Close the creation transaction before editing text.
    fireEvent.change(within(scene).getByRole('textbox', { name: 'Text' }), {
      target: { value: 'CHANGED' },
    })
    flushAutosaves()
    const saved = readSaved('canvas')
    shiftClick(node('master'))
    flushAutosaves()
    expect(readSaved('canvas')).toEqual(saved)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(within(scene).getByRole('textbox', { name: 'Text' })).not.toHaveValue('CHANGED')
    expect(scene).toHaveAttribute('data-selected')
    expect(node('master').parentElement).toHaveAttribute('data-selected')
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(within(scene).getByRole('textbox', { name: 'Text' })).toHaveValue('CHANGED')
    expect(node('master').parentElement).toHaveAttribute('data-selected')
  })

  it('a plain editable-control click collapses the group, without moving any nodes', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    const twist = insertModifier('twist')
    shiftClick(scene)
    const before = scene.style.left
    clickNode(within(twist).getByRole('slider', { name: 'flutes' }))
    expect(twist.parentElement).toHaveAttribute('data-selected')
    expect(scene).not.toHaveAttribute('data-selected')
    shiftClick(scene)
    clickNode(within(scene).getByRole('textbox', { name: 'Text' }))
    expect(scene).toHaveAttribute('data-selected')
    expect(twist.parentElement).not.toHaveAttribute('data-selected')
    expect(scene.style.left).toBe(before)
  })

  it('keeps range handles for multiple selected linked modifiers beside a selected scene, and handle drags edit only modifier params', async () => {
    const { container } = render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    insertModifier('twist', 40, 40)
    insertModifier('twist', 400, 40)
    const first = node('twist 1')
    const second = node('twist 2')
    link(
      within(first).getByLabelText('twist 1 output'),
      within(scene).getByLabelText('scene 1 input'),
      21,
    )
    link(
      within(second).getByLabelText('twist 2 output'),
      within(scene).getByLabelText('scene 1 input'),
      22,
    )
    expect(container.querySelectorAll('.node-links path')).toHaveLength(2)
    shiftClick(first)
    shiftClick(scene)
    expect(first.parentElement).toHaveAttribute('data-selected')
    expect(second.parentElement).toHaveAttribute('data-selected')

    const firstHandle = await screen.findByRole('slider', { name: 'twist 1 from' })
    expect(screen.getByRole('slider', { name: 'twist 2 from' })).toBeInTheDocument()
    const beforeLeft = scene.style.left
    const track = firstHandle.parentElement!
    Object.defineProperty(track, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    })
    fireEvent.pointerDown(firstHandle, { button: 0, pointerId: 31, clientY: 20 })
    fireEvent.pointerMove(firstHandle, { pointerId: 31, clientY: 80 })
    fireEvent.pointerUp(firstHandle, { pointerId: 31, clientY: 80 })
    expect(scene.style.left).toBe(beforeLeft)
    expect(firstHandle).toHaveAttribute('aria-valuenow', '80')
  })
})
