/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))
vi.mock('../../src/components/SceneArtboard', () => ({
  SceneArtboard: ({
    onOutline,
    settings,
  }: {
    onOutline: (outline: unknown) => void
    settings: { columnWidth: number }
  }) => {
    useEffect(() => {
      const x = settings.columnWidth
      onOutline({
        contours: [
          [
            { x, y: 0 },
            { x: x - 20, y: 0 },
            { x: x - 20, y: 100 },
            { x, y: 100 },
          ],
        ],
      })
    }, [onOutline, settings.columnWidth])
    return (
      <div className="artboard">
        <div className="rag-editor" data-canvas-mode>
          <textarea className="rag-text" aria-label="Text" readOnly />
          <div className="rag-text-handle" aria-label="select text node" />
        </div>
      </div>
    )
  },
}))

it.each(['twist', 'etch', 'texture', 'pattern'])(
  'activates an unselected linked %s from its artboard range',
  async (kind) => {
    render(<CanvasPage tools={null} />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    fireEvent.contextMenu(canvas, { clientX: 200, clientY: 150 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
    const scene = await screen.findByLabelText('scene 1')
    fireEvent.contextMenu(canvas, { clientX: 40, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitem', { name: `insert ${kind}` }))
    const node = screen.getByRole('group', { name: `${kind} 1` })
    fireEvent.pointerDown(within(node).getByLabelText(`${kind} 1 output`), {
      button: 0,
      pointerId: 1,
    })
    fireEvent.pointerUp(within(scene).getByLabelText('scene 1 input'), { pointerId: 1 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 2 })
    expect(node.parentElement).not.toHaveAttribute('data-selected')
    expect(within(scene).queryByRole('slider', { name: `${kind} 1 from` })).not.toBeInTheDocument()
    const area = await within(scene).findByLabelText(`select ${kind} 1 range`)
    fireEvent.pointerDown(area, { button: 0, pointerId: 3 })
    fireEvent.pointerUp(area, { button: 0, pointerId: 3 })
    expect(node.parentElement).toHaveAttribute('data-selected')
    expect(within(scene).getByRole('slider', { name: `${kind} 1 from` })).toBeInTheDocument()
    expect(within(scene).getByRole('slider', { name: `${kind} 1 to` })).toBeInTheDocument()
  },
)

it('drags the scene (not the modifier) from a range band; only a tap selects the modifier', async () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  fireEvent.contextMenu(canvas, { clientX: 200, clientY: 150 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
  const scene = await screen.findByLabelText('scene 1')
  fireEvent.contextMenu(canvas, { clientX: 40, clientY: 40 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
  const node = screen.getByRole('group', { name: 'twist 1' })
  fireEvent.pointerDown(within(node).getByLabelText('twist 1 output'), { button: 0, pointerId: 1 })
  fireEvent.pointerUp(within(scene).getByLabelText('scene 1 input'), { pointerId: 1 })
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 9 })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 9 })
  const area = await within(scene).findByLabelText('select twist 1 range')
  const before = { left: scene.style.left, top: scene.style.top }
  fireEvent.pointerDown(area, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(area, { pointerId: 2, clientX: 60, clientY: 40 })
  fireEvent.pointerUp(area, { pointerId: 2, clientX: 60, clientY: 40 })
  expect(scene.style.left).not.toBe(before.left)
  expect(scene.style.top).not.toBe(before.top)
  expect(node.parentElement).not.toHaveAttribute('data-selected')
})

it('stacks the artboard text above range bands and endpoints without blocking empty artwork', async () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles/global.css', 'utf8')
  document.head.appendChild(style)
  try {
    render(<CanvasPage tools={null} />)
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    fireEvent.contextMenu(canvas, { clientX: 200, clientY: 150 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
    const scene = await screen.findByLabelText('scene 1')
    const artboard = scene.querySelector<HTMLElement>('.artboard')!
    const editor = artboard.querySelector<HTMLElement>('.rag-editor')!
    const handle = within(scene).getByLabelText('select text node')
    const text = within(scene).getByLabelText('Text')
    expect(getComputedStyle(artboard).zIndex).toBe('1')
    expect(getComputedStyle(artboard).pointerEvents).toBe('none')
    expect(getComputedStyle(handle).pointerEvents).toBe('auto')
    expect(getComputedStyle(text).pointerEvents).toBe('none')
    editor.dataset.textEditable = 'true'
    expect(getComputedStyle(text).pointerEvents).toBe('auto')
  } finally {
    style.remove()
  }
})
