import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'
import { SaveControls } from '../../src/components/SaveControls'
import { readSaved } from '../../src/state'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))
vi.mock('../../src/timeline', () => import('../support/timelineStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })

describe('autosave', () => {
  it('keeps the canvas: scenes, twists, links and edits come back after leaving', async () => {
    const first = render(<CanvasPage tools={null} />)
    fireEvent.contextMenu(canvas(), { clientX: 200, clientY: 150 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
    await screen.findByLabelText('scene 1')
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'KEEP' } })
    fireEvent.contextMenu(canvas(), { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
    fireEvent.change(screen.getByRole('slider', { name: 'flutes' }), { target: { value: '21' } })
    fireEvent.pointerDown(screen.getByLabelText('twist 1 output'), { button: 0 })
    fireEvent.pointerUp(screen.getByLabelText('scene 1 input'))
    // Leaving the page (unmounting) writes it at once.
    first.unmount()

    const { container } = render(<CanvasPage tools={null} />)
    const scene = screen.getByLabelText('scene 1')
    expect(within(scene).getByLabelText('Text')).toHaveValue('KEEP')
    expect(screen.getByRole('slider', { name: 'flutes' })).toHaveValue('21')
    expect(container.querySelectorAll('.node-links path')).toHaveLength(1)
    // New nodes don't reuse ids.
    fireEvent.contextMenu(canvas(), { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
    expect(screen.getByRole('group', { name: 'twist 2' })).toBeInTheDocument()
  })

  it('saves shortly after a change, without leaving', async () => {
    vi.useFakeTimers()
    try {
      render(<CanvasPage tools={null} />)
      fireEvent.contextMenu(canvas(), { clientX: 20, clientY: 20 })
      fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(readSaved('canvas')).toMatchObject({ modifiers: [{ id: 'twist-1', kind: 'twist' }] })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('manual save', () => {
  it('⌘S writes a project file with every page', async () => {
    const write = vi.fn()
    const picker = vi.fn(async () => ({
      name: 'mine.json',
      createWritable: async () => ({ write, close: async () => {} }),
    }))
    Object.assign(window, { showSaveFilePicker: picker })
    try {
      render(<CanvasPage tools={<SaveControls />} />)
      fireEvent.contextMenu(canvas(), { clientX: 20, clientY: 20 })
      fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))

      fireEvent.keyDown(window, { key: 's', metaKey: true })
      expect(await screen.findByText(/saved mine\.json/)).toBeInTheDocument()
      const file = JSON.parse(write.mock.calls[0]?.[0] as string)
      expect(file).toMatchObject({
        app: 'rgd-generator',
        canvas: { modifiers: [{ id: 'twist-1', kind: 'twist' }] },
      })

      // Later saves go to the same file without asking.
      fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2))
      expect(picker).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(window, 'showSaveFilePicker')
    }
  })
})
