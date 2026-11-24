import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })
const node = (name: string) => screen.getByRole('group', { name })

function insert(kind: string, x: number, y: number) {
  fireEvent.contextMenu(canvas(), { clientX: x, clientY: y })
  fireEvent.click(screen.getByRole('menuitem', { name: `insert ${kind}` }))
}

function press(element: Element, options: Record<string, unknown> = {}) {
  const pointerId = Math.random()
  fireEvent.pointerDown(element, { button: 0, pointerId, ...options })
  fireEvent.pointerUp(element, { button: 0, pointerId, ...options })
}

function link(from: string, to: string, pointerId: number) {
  fireEvent.pointerDown(screen.getByLabelText(`${from} output`), { button: 0, pointerId })
  fireEvent.pointerUp(screen.getByLabelText(`${to} input`), { pointerId })
}

const count = (group: string) =>
  Number(within(node(group)).getByText(/^\d+$/, { selector: '.cluster-frame-count' }).textContent)

async function setup() {
  const view = render(<CanvasPage tools={null} />)
  insert('scene', 200, 150)
  await screen.findByLabelText('scene 1')
  insert('twist', 40, 40)
  insert('etch', 40, 400)
  insert('twist', 40, 700)
  press(node('twist 1'))
  press(node('etch 1'), { shiftKey: true })
  fireEvent.keyDown(window, { key: 'g', metaKey: true })
  link('group 1', 'scene 1', 1)
  const lines = () => view.container.querySelectorAll('.node-links path')
  return { lines }
}

describe('groups', () => {
  it('⌘G with a group and a node selected adds the node to that group; it keeps no links of its own', async () => {
    const { lines } = await setup()
    link('twist 2', 'scene 1', 2)
    expect(lines()).toHaveLength(2)

    press(node('group 1'))
    press(node('twist 2'), { shiftKey: true })
    fireEvent.keyDown(window, { key: 'g', metaKey: true })
    expect(screen.queryByRole('group', { name: 'group 2' })).toBeNull()
    expect(count('group 1')).toBe(3)
    expect(lines()).toHaveLength(1)
    expect(screen.queryByLabelText('twist 2 output')).toBeNull()
    expect(screen.getByLabelText('group 1 output')).toHaveAttribute('data-connected')
  })

  it('the frame follows a member while it is dragged, before it is let go', async () => {
    await setup()
    const frame = node('group 1').closest<HTMLElement>('.cluster-frame')!
    const width = parseFloat(frame.style.width)
    const twist = node('twist 1')
    fireEvent.pointerDown(twist, { button: 0, pointerId: 9, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(twist, { pointerId: 9, clientX: 410, clientY: 10 })
    await waitFor(() => expect(parseFloat(frame.style.width)).toBeCloseTo(width + 400))
    fireEvent.pointerUp(twist, { pointerId: 9, clientX: 410, clientY: 10 })
    await waitFor(() => expect(parseFloat(frame.style.width)).toBeCloseTo(width + 400))
  })

  it('↓ stacks the group’s nodes in one column: by from %, then to %, rangeless last', () => {
    render(<CanvasPage tools={null} />)
    insert('material', 300, 40)
    insert('etch', 40, 200)
    insert('twist', 600, 700)
    press(node('material 1'))
    press(node('etch 1'), { shiftKey: true })
    press(node('twist 1'), { shiftKey: true })
    fireEvent.keyDown(window, { key: 'g', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'arrange group 1' }))
    // Twist and etch share from 55; the twist ends first (to 70 < 75).
    const place = (name: string) => {
      const style = node(name).closest<HTMLElement>('[data-canvas-node]')!.style
      return { x: parseFloat(style.left), y: parseFloat(style.top) }
    }
    const [twist, etch, material] = [place('twist 1'), place('etch 1'), place('material 1')]
    expect(new Set([twist.x, etch.x, material.x]).size).toBe(1)
    expect(twist.y).toBeLessThan(etch.y)
    expect(etch.y).toBeLessThan(material.y)
  })

  it('a copy of a grouped node stays in the group; Option+⌘-drag copies it outside', async () => {
    await setup()
    press(node('twist 1'))
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    expect(node('twist 3')).toBeInTheDocument()
    expect(count('group 1')).toBe(3)
    expect(screen.queryByLabelText('twist 3 output')).toBeNull()

    const twist = node('twist 1')
    const options = { pointerId: 8, altKey: true, metaKey: true }
    fireEvent.pointerDown(twist, { button: 0, clientX: 10, clientY: 10, ...options })
    fireEvent.pointerMove(twist, { clientX: 90, clientY: 40, ...options })
    fireEvent.pointerUp(twist, { clientX: 90, clientY: 40, ...options })
    fireEvent.click(twist, options)
    expect(node('twist 4')).toBeInTheDocument()
    expect(count('group 1')).toBe(3)
    expect(screen.getByLabelText('twist 4 output')).toBeInTheDocument()
    // The Option+⌘ press didn't mute the original.
    expect(twist.parentElement).not.toHaveAttribute('data-muted')
  })

  it('⌘-click mutes and unmutes a node inside its group, not the group', async () => {
    await setup()
    const twist = node('twist 1')
    const frame = node('group 1').closest('[data-cluster-id]')!
    press(twist, { metaKey: true })
    fireEvent.click(twist, { metaKey: true })
    expect(twist.parentElement).toHaveAttribute('data-muted')
    expect(node('etch 1').parentElement).not.toHaveAttribute('data-muted')
    expect(frame).not.toHaveAttribute('data-muted')

    // Ungrouped, the node keeps its mute on its own link.
    press(node('group 1'))
    fireEvent.keyDown(window, { key: 'g', metaKey: true, shiftKey: true })
    expect(node('twist 1').parentElement).toHaveAttribute('data-muted')
    expect(node('etch 1').parentElement).not.toHaveAttribute('data-muted')

    fireEvent.click(node('twist 1'), { metaKey: true })
    expect(node('twist 1').parentElement).not.toHaveAttribute('data-muted')
  })
})
