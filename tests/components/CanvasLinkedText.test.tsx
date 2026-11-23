import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

import { setNodeText } from '../support/textNode'

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
  const speed = within(textNode).getByRole('slider', { name: 'line 1 speed' })
  expect(speed).toHaveValue('8')
  fireEvent.change(speed, { target: { value: '12' } })
  expect(speed).toHaveValue('12')
  expect(within(textNode).getByRole('textbox', { name: 'line 1' })).toHaveClass('control-text')
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
  setNodeText(textNode, 'Complete source')
  fireEvent.click(within(textNode).getByRole('button', { name: 'Play typing' }))
  expect(firstText).toHaveValue('')
  fireEvent.focus(firstText)
  expect(firstText).toHaveValue('Complete source')
  expect(secondText).toHaveValue('Complete source')
  // Several lines typed on the artboard become the node's line inputs.
  fireEvent.change(firstText, { target: { value: 'ONE\nTWO\nTHREE' } })
  expect(
    within(textNode)
      .getAllByRole('textbox')
      .map((box) => (box as HTMLInputElement).value),
  ).toEqual(['ONE', 'TWO', 'THREE'])
  expect(secondText).toHaveValue('ONE\nTWO\nTHREE')
  fireEvent.change(firstText, { target: { value: 'Shared update' } })
  expect(secondText).toHaveValue('Shared update')
  expect(within(textNode).getAllByRole('textbox')).toHaveLength(1)
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 32 })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 32 })
  expect(textNode.parentElement).not.toHaveAttribute('data-selected')
  expect(firstText).toHaveAttribute('readonly')
  expect(secondText).toHaveAttribute('readonly')
  expect(secondText).toHaveValue('Shared update')
})
