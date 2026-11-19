import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

it('selects linked text from an artboard handle, shares edits, and locks again on deselection', async () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  for (const x of [200, 700]) {
    fireEvent.contextMenu(canvas, { clientX: x, clientY: 150 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
  }
  const scene1 = await screen.findByLabelText('scene 1')
  const scene2 = await screen.findByLabelText('scene 2')
  fireEvent.contextMenu(canvas, { clientX: 40, clientY: 40 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert text' }))
  const textNode = screen.getByRole('group', { name: 'text 1' })
  for (const [index, scene] of [scene1, scene2].entries()) {
    const pointerId = index + 10
    fireEvent.pointerDown(within(textNode).getByLabelText('text 1 output'), {
      button: 0,
      pointerId,
    })
    fireEvent.pointerMove(window, { pointerId, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(within(scene).getByLabelText(`scene ${index + 1} input`), { pointerId })
  }
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 30 })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 30 })
  const firstText = within(scene1).getByRole('textbox', { name: 'Text' })
  const secondText = within(scene2).getByRole('textbox', { name: 'Text' })
  expect(firstText).toHaveAttribute('readonly')
  expect(secondText).toHaveAttribute('readonly')
  const handle = await within(scene1).findAllByLabelText('select text node', {}, { timeout: 5000 })
  fireEvent.pointerDown(handle[0]!, { button: 0, pointerId: 31 })
  expect(textNode.parentElement).toHaveAttribute('data-selected')
  expect(firstText).not.toHaveAttribute('readonly')
  expect(secondText).not.toHaveAttribute('readonly')
  fireEvent.change(firstText, { target: { value: 'Shared update' } })
  expect(secondText).toHaveValue('Shared update')
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 32 })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 32 })
  expect(textNode.parentElement).not.toHaveAttribute('data-selected')
  expect(firstText).toHaveAttribute('readonly')
  expect(secondText).toHaveAttribute('readonly')
  expect(secondText).toHaveValue('Shared update')
})
