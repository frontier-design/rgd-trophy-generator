import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

it('command-click toggles all outgoing links without changing the text node', async () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  for (const x of [200, 700]) {
    fireEvent.contextMenu(canvas, { clientX: x, clientY: 150 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
  }
  const scenes = [await screen.findByLabelText('scene 1'), await screen.findByLabelText('scene 2')]
  fireEvent.contextMenu(canvas, { clientX: 40, clientY: 40 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert text' }))
  const node = screen.getByRole('group', { name: 'text 1' })
  fireEvent.change(within(node).getByRole('textbox'), { target: { value: 'Linked text' } })
  for (const [i, scene] of scenes.entries()) {
    fireEvent.pointerDown(within(node).getByLabelText('text 1 output'), {
      button: 0,
      pointerId: i + 10,
    })
    fireEvent.pointerUp(within(scene).getByLabelText(`scene ${i + 1} input`), { pointerId: i + 10 })
  }
  const textboxes = scenes.map((scene) => within(scene).getByRole('textbox', { name: 'Text' }))
  for (const box of textboxes) expect(box).toHaveValue('Linked text')
  fireEvent.pointerDown(node, { button: 0, metaKey: true })
  fireEvent.click(node, { metaKey: true })
  expect(node.parentElement).toHaveAttribute('data-muted')
  expect(canvas.querySelectorAll('.node-links path[data-muted]')).toHaveLength(2)
  for (const box of textboxes) expect(box).not.toHaveValue('Linked text')
  expect(within(node).getByRole('textbox')).toHaveValue('Linked text')
  fireEvent.click(node, { metaKey: true })
  expect(node.parentElement).not.toHaveAttribute('data-muted')
  for (const box of textboxes) expect(box).toHaveValue('Linked text')
})
