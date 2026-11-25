import { fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

it('shows the scene’s animated properties as keyframe rows in the record timeline, draggable in time', async () => {
  render(<CanvasPage tools={null} />)
  const canvas = screen.getByRole('region', { name: 'Canvas' })
  const insert = (name: string) => {
    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByRole('menuitem', { name }))
  }
  const link = (from: HTMLElement, fromLabel: string, to: HTMLElement, pointerId: number) => {
    fireEvent.pointerDown(within(from).getByLabelText(fromLabel), { button: 0, pointerId })
    fireEvent.pointerUp(to, { pointerId })
  }
  insert('insert scene')
  const scene = await screen.findByLabelText('scene 1')
  insert('insert record')
  const record = screen.getByLabelText('record 1')
  link(scene, 'scene 1 output', within(record).getByLabelText('record 1 input'), 1)
  insert('insert twist')
  const twist = screen.getByRole('group', { name: 'twist 1' })
  link(twist, 'twist 1 output', within(scene).getByLabelText('scene 1 input'), 2)

  // Two depth keyframes: at 0 s and (playhead moved) at 1 s.
  fireEvent.click(within(twist).getByRole('button', { name: 'depth animation' }))
  const timeline = within(twist).getByRole('group', { name: 'depth animation' })
  fireEvent.click(within(timeline).getByRole('button', { name: 'add depth keyframe' }))
  fireEvent.keyDown(within(timeline).getByRole('slider', { name: 'depth playhead' }), {
    key: 'ArrowRight',
    shiftKey: true,
  })
  fireEvent.click(within(timeline).getByRole('button', { name: 'add depth keyframe' }))

  const keys = () =>
    within(record)
      .queryAllByRole('slider', { name: /^twist 1 · depth keyframe/ })
      .map((key) => Number(key.getAttribute('aria-valuenow')))
  expect(within(record).getByText('twist 1 · depth')).toBeInTheDocument()
  expect(keys()).toEqual([0, 1])

  // Dragged on the record's timeline (laid out 150 px for its 1.5 s), the keyframe moves.
  const track = record.querySelector<HTMLElement>('.record-track')!
  track.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 150, bottom: 20, width: 150, height: 20, x: 0, y: 0 }) as DOMRect
  const second = within(record).getByRole('slider', { name: 'twist 1 · depth keyframe 2' })
  fireEvent.pointerDown(second, { button: 0, pointerId: 7, clientX: 100 })
  fireEvent.pointerMove(second, { pointerId: 7, clientX: 50 })
  fireEvent.pointerUp(second, { pointerId: 7 })
  expect(keys()).toEqual([0, 0.5])
  expect(
    within(timeline)
      .getAllByRole('button', { name: /^depth keyframe at/ })
      .map((k) => k.getAttribute('aria-label')),
  ).toEqual(['depth keyframe at 0.00s', 'depth keyframe at 0.50s'])
})
