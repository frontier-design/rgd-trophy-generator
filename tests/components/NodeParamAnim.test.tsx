import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

/** jsdom lays nothing out: give the keyframe track a width, so pointer x maps to time. */
function layOut(element: Element, width = 200) {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: 34, width, height: 34, x: 0, y: 0 }) as DOMRect
}

it("animates a modifier's slider with keyframes on a timeline, which the slider edits at the playhead", () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
  const twist = screen.getByRole('group', { name: 'twist 1' })
  const depth = () => within(twist).getByRole('slider', { name: 'depth' }) as HTMLInputElement
  const start = Number(depth().value)

  // The keyframe diamond opens the timeline; nothing animates yet.
  const diamond = within(twist).getByRole('button', { name: 'depth animation' })
  expect(diamond).not.toHaveAttribute('data-animated')
  fireEvent.click(diamond)
  const timeline = within(twist).getByRole('group', { name: 'depth animation' })
  const playhead = within(timeline).getByRole('slider', { name: 'depth playhead' })
  layOut(playhead)
  const keys = () =>
    within(timeline)
      .queryAllByRole('button', { name: /^depth keyframe at/ })
      .map((key) => key.getAttribute('aria-label')!.replace('depth keyframe at ', ''))

  // A keyframe at the playhead (0 s) with the slider's value: now it animates.
  fireEvent.click(within(timeline).getByRole('button', { name: 'add depth keyframe' }))
  expect(keys()).toEqual(['0.00s'])
  expect(diamond).toHaveAttribute('data-animated')
  expect(
    within(timeline).getByRole('button', { name: 'remove depth keyframe' }),
  ).toBeInTheDocument()

  // Playhead to 1 s, then the slider sets a keyframe there.
  fireEvent.keyDown(playhead, { key: 'ArrowRight', shiftKey: true })
  expect(within(timeline).getByLabelText('depth time')).toHaveTextContent('1.00s')
  fireEvent.change(depth(), { target: { value: String(start + 30) } })
  expect(keys()).toEqual(['0.00s', '1.00s'])
  // Halfway back, the slider shows the value between them.
  for (let i = 0; i < 5; i++) fireEvent.keyDown(playhead, { key: 'ArrowLeft' })
  expect(Number(depth().value)).toBeCloseTo(start + 15, 0)

  // Dragging a keyframe moves it in time (the track shows 4 s across 200 px, from -0.16 s:
  // a little room before 0).
  const second = within(timeline).getByRole('button', { name: 'depth keyframe at 1.00s' })
  fireEvent.pointerDown(second, { button: 0, pointerId: 3, clientX: 58 })
  fireEvent.pointerMove(second, { pointerId: 3, clientX: 108 })
  fireEvent.pointerUp(second, { pointerId: 3 })
  expect(keys()).toEqual(['0.00s', '2.00s'])

  // Selecting the first offers its easing (how it moves on to the next).
  const first = within(timeline).getByRole('button', { name: 'depth keyframe at 0.00s' })
  fireEvent.pointerDown(first, { button: 0, pointerId: 4, clientX: 0 })
  fireEvent.pointerUp(first, { pointerId: 4 })
  const easing = within(timeline).getByRole('combobox', { name: 'depth easing' })
  fireEvent.change(easing, { target: { value: 'hold' } })
  expect(easing).toHaveValue('hold')

  // Scroll pans the track (the 0 s mark goes off its left), ⌘-scroll zooms it.
  expect(within(playhead).getByText('0s')).toBeInTheDocument()
  fireEvent.wheel(playhead, { deltaX: 200, clientX: 100 })
  expect(within(playhead).queryByText('0s')).toBeNull()
  const before = within(playhead).getAllByText(/^\d+s$/).length
  fireEvent.wheel(playhead, { deltaY: -400, metaKey: true, clientX: 100 })
  expect(within(playhead).queryAllByText(/^\d+s$/).length).toBeLessThan(before)

  // The keyframe at the playhead goes again from the bar.
  fireEvent.pointerDown(first, { button: 0, pointerId: 5, clientX: 0 })
  fireEvent.pointerUp(first, { pointerId: 5 })
  fireEvent.click(within(timeline).getByRole('button', { name: 'remove depth keyframe' }))
  expect(keys()).toEqual(['2.00s'])
})
