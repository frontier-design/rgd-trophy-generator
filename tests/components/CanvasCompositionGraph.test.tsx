import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

it('connects an artboard to a composition but rejects modifier inputs', async () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  const insert = (name: string) => {
    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByRole('menuitem', { name }))
  }
  insert('insert scene')
  const scene = await screen.findByLabelText('scene 1')
  insert('insert composition')
  const composition = screen.getByLabelText('composition 1')
  insert('insert twist')
  const twist = screen.getByRole('group', { name: 'twist 1' })
  const input = within(composition).getByLabelText('composition 1 input')
  fireEvent.pointerDown(within(twist).getByLabelText('twist 1 output'), { button: 0, pointerId: 1 })
  fireEvent.pointerUp(input, { pointerId: 1 })
  expect(input).not.toHaveAttribute('data-connected')
  fireEvent.pointerDown(within(scene).getByLabelText('scene 1 output'), { button: 0, pointerId: 2 })
  fireEvent.pointerUp(input, { pointerId: 2 })
  expect(input).toHaveAttribute('data-connected')
  expect(canvas.querySelectorAll('.node-links path:not([data-pending])')).toHaveLength(1)
  fireEvent.click(scene, { metaKey: true })
  expect(input).not.toHaveAttribute('data-connected')
  fireEvent.click(scene, { metaKey: true })
  expect(input).toHaveAttribute('data-connected')
})
