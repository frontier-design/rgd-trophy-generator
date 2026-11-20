import { act, fireEvent, render, screen } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'
import { readSaved } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))
vi.mock('../../src/timeline', () => import('../support/timelineStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })

function insertPattern() {
  fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert pattern' }))
  return screen.getByRole('group', { name: 'pattern 1' })
}

function prepareViewer() {
  const stage = document.querySelector<HTMLElement>('.pattern-crop-stage')
  if (!stage) throw new Error('missing crop stage')
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 100,
    width: 200,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect)
}

function resizeCropToHalf() {
  fireEvent.pointerDown(screen.getByLabelText('crop handle se'), {
    button: 0,
    clientX: 0,
    clientY: 0,
  })
  fireEvent.pointerMove(window, { clientX: -100, clientY: -50 })
  fireEvent.pointerUp(window)
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 400)))

describe('pattern crop in the workspace', () => {
  it('undoes and redoes crop edits (and saves them)', async () => {
    render(<CanvasPage tools={null} />)
    insertPattern()
    prepareViewer()
    expect(screen.getByLabelText('Crop region')).toHaveStyle({ width: '100%', height: '100%' })
    // Insertion settles into its own undo step, so the crop edit is another.
    await settle()

    resizeCropToHalf()
    expect(screen.getByLabelText('Crop region')).toHaveStyle({ width: '50%', height: '50%' })
    await settle()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(screen.getByLabelText('Crop region')).toHaveStyle({ width: '100%', height: '100%' })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(screen.getByLabelText('Crop region')).toHaveStyle({ width: '50%', height: '50%' })

    await settle()
    const saved = readSaved('canvas') as {
      modifiers: Array<{ kind: string; params: { crop: unknown } }>
    }
    const pattern = saved.modifiers.find((node) => node.kind === 'pattern')
    expect(pattern?.params.crop).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 })
  })

  it('restores the crop after leaving and reopening the canvas', async () => {
    const first = render(<CanvasPage tools={null} />)
    insertPattern()
    prepareViewer()
    resizeCropToHalf()
    expect(screen.getByLabelText('Crop region')).toHaveStyle({ width: '50%', height: '50%' })
    // Leaving the page writes its pending autosave.
    first.unmount()

    render(<CanvasPage tools={null} />)
    expect(screen.getByLabelText('Crop region')).toHaveStyle({
      left: '0%',
      top: '0%',
      width: '50%',
      height: '50%',
    })
  })
})
