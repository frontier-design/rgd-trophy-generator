import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

it("animates a modifier's slider: a chevron unfolds Anim, the line, and From / To, which the slider edits", () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
  const twist = screen.getByRole('group', { name: 'twist 1' })
  const depth = () => within(twist).getByRole('slider', { name: 'depth' })
  const start = Number((depth() as HTMLInputElement).value)

  fireEvent.click(within(twist).getByRole('button', { name: 'depth animation' }))
  const controls = within(twist).getByRole('group', { name: 'depth animation' })
  // Off: just the toggle.
  expect(within(controls).queryByRole('button', { name: 'from' })).toBeNull()
  fireEvent.click(within(controls).getByRole('checkbox', { name: 'animate depth' }))
  expect(within(controls).getByRole('spinbutton', { name: 'depth line' })).toHaveValue(1)
  const from = within(controls).getByRole('button', { name: 'from' })
  const to = within(controls).getByRole('button', { name: 'to' })
  // Starts editing to; from and to both at the slider's value.
  expect(to).toHaveAttribute('aria-pressed', 'true')

  // On From, the slider edits (and shows) the from value; on To, the to value.
  fireEvent.click(from)
  fireEvent.change(depth(), { target: { value: '12' } })
  expect(depth()).toHaveValue('12')
  fireEvent.click(to)
  expect(depth()).toHaveValue(String(start))
  fireEvent.change(depth(), { target: { value: '30' } })
  fireEvent.click(from)
  expect(depth()).toHaveValue('12')
  fireEvent.click(to)
  expect(depth()).toHaveValue('30')
  // The line it follows.
  fireEvent.change(within(controls).getByRole('spinbutton', { name: 'depth line' }), {
    target: { value: '3' },
  })
  expect(within(controls).getByRole('spinbutton', { name: 'depth line' })).toHaveValue(3)

  // The easing: ease by default; five to choose from.
  const easing = within(controls).getByRole('combobox', { name: 'depth easing' })
  expect(easing).toHaveValue('ease')
  expect(
    within(easing)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['ease', 'linear', 'fast out', 'fast in-out', 'hold'])
  fireEvent.change(easing, { target: { value: 'hold' } })
  expect(within(controls).getByRole('combobox', { name: 'depth easing' })).toHaveValue('hold')

  // Off again: the slider shows the node's own value (edits went to from / to).
  fireEvent.click(within(controls).getByRole('checkbox', { name: 'animate depth' }))
  expect(depth()).toHaveValue(String(start))
})
