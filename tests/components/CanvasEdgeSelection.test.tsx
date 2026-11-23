/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })
const node = (name: string) => screen.getByRole('group', { name })

function insertModifier(kind: 'twist' | 'etch', x: number, y: number) {
  fireEvent.contextMenu(canvas(), { clientX: x, clientY: y })
  fireEvent.click(screen.getByRole('menuitem', { name: `insert ${kind}` }))
  return node(`${kind} 1`)
}

function press(element: Element, options: Record<string, unknown> = {}) {
  const pointerId = Math.random()
  fireEvent.pointerDown(element, { button: 0, pointerId, ...options })
  fireEvent.pointerUp(element, { button: 0, pointerId, ...options })
}

function link(from: Element, to: Element, pointerId: number) {
  fireEvent.pointerDown(from, { button: 0, pointerId })
  fireEvent.pointerUp(to, { pointerId })
}

async function setup() {
  const view = render(<CanvasPage tools={null} />)
  fireEvent.contextMenu(canvas(), { clientX: 200, clientY: 150 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
  await screen.findByLabelText('scene 1')
  const twist = insertModifier('twist', 40, 40)
  const etch = insertModifier('etch', 40, 400)
  link(screen.getByLabelText('twist 1 output'), screen.getByLabelText('scene 1 input'), 1)
  link(screen.getByLabelText('etch 1 output'), screen.getByLabelText('scene 1 input'), 2)
  const hit = (from: string) =>
    view.container.querySelector(`.node-link-hits [data-edge="${from}→scene-1"]`)!
  const line = (from: string) =>
    view.container.querySelectorAll('.node-links path')[from === 'twist-1' ? 0 : 1]!
  const lines = () => view.container.querySelectorAll('.node-links path')
  return { twist, etch, hit, line, lines }
}

describe('edge selection', () => {
  it('selects an edge alone, Shift toggles more, and nodes and edges never share a selection', async () => {
    const { twist, hit, line } = await setup()
    press(twist)
    expect(twist.parentElement).toHaveAttribute('data-selected')

    press(hit('twist-1'))
    expect(line('twist-1')).toHaveAttribute('data-selected')
    expect(twist.parentElement).not.toHaveAttribute('data-selected')

    press(hit('etch-1'), { shiftKey: true })
    expect(line('twist-1')).toHaveAttribute('data-selected')
    expect(line('etch-1')).toHaveAttribute('data-selected')
    press(hit('twist-1'), { shiftKey: true })
    expect(line('twist-1')).not.toHaveAttribute('data-selected')

    press(hit('twist-1'))
    expect(line('twist-1')).toHaveAttribute('data-selected')
    expect(line('etch-1')).not.toHaveAttribute('data-selected')

    // Selecting a node (even with Shift) deselects the edges.
    press(twist, { shiftKey: true })
    expect(twist.parentElement).toHaveAttribute('data-selected')
    expect(line('twist-1')).not.toHaveAttribute('data-selected')

    // A background click and Escape clear edges too.
    press(hit('twist-1'))
    press(canvas())
    expect(line('twist-1')).not.toHaveAttribute('data-selected')
    press(hit('twist-1'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(line('twist-1')).not.toHaveAttribute('data-selected')
  })

  it('the marquee selects nodes only, deselecting edges', async () => {
    const { twist, hit, line } = await setup()
    press(hit('twist-1'))
    vi.spyOn(twist, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 200,
      bottom: 200,
      width: 100,
      height: 100,
    } as DOMRect)
    fireEvent.pointerDown(canvas(), {
      button: 0,
      pointerId: 7,
      shiftKey: true,
      clientX: 50,
      clientY: 50,
    })
    fireEvent.pointerUp(canvas(), { pointerId: 7, clientX: 250, clientY: 250 })
    expect(twist.parentElement).toHaveAttribute('data-selected')
    expect(line('twist-1')).not.toHaveAttribute('data-selected')
  })

  it('Delete removes the selected edges (undoable), keeping their nodes', async () => {
    const { hit, lines } = await setup()
    expect(lines()).toHaveLength(2)
    press(hit('twist-1'))
    press(hit('etch-1'), { shiftKey: true })
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(lines()).toHaveLength(0)
    expect(node('twist 1')).toBeInTheDocument()
    expect(node('etch 1')).toBeInTheDocument()
    expect(screen.getByLabelText('scene 1')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(lines()).toHaveLength(2)
  })

  it('hit areas scale with the zoom (Chrome does not hit-test non-scaling strokes)', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')
    const rule = css.match(/\.node-link-hits path \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/stroke-width:\s*calc\(14px \/ var\(--zoom/)
    expect(rule).not.toMatch(/vector-effect/)
  })
})
