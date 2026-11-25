import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

it('opens a lighting view slider’s animation under the bottom slider from its keyframe button', () => {
  render(<CanvasPage tools={null} />)
  fireEvent.contextMenu(screen.getByRole('region', { name: 'Canvas' }), {
    clientX: 40,
    clientY: 40,
  })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert lighting' }))
  const card = screen.getByRole('group', { name: 'lighting 1' })

  const angle = within(card).getByRole('button', { name: 'light angle animation' })
  const height = within(card).getByRole('button', { name: 'light height animation' })
  expect(within(card).queryByRole('group', { name: /animation$/ })).toBeNull()

  // One open at a time: the angle's, then the height's in its place.
  fireEvent.click(angle)
  expect(angle).toHaveAttribute('aria-expanded', 'true')
  expect(within(card).getByRole('group', { name: 'light angle animation' })).toBeInTheDocument()
  fireEvent.click(height)
  expect(within(card).queryByRole('group', { name: 'light angle animation' })).toBeNull()
  const panel = within(card).getByRole('group', { name: 'light height animation' })

  // A keyframe fills its diamond.
  fireEvent.click(within(panel).getByRole('button', { name: 'add light height keyframe' }))
  expect(height).toHaveAttribute('data-animated')
  expect(within(panel).getAllByRole('button', { name: /^light height keyframe at/ })).toHaveLength(
    1,
  )
  fireEvent.click(height)
  expect(within(card).queryByRole('group', { name: 'light height animation' })).toBeNull()
})
