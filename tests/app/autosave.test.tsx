import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'
import { SaveControls } from '../../src/components/SaveControls'
import {
  clearImageAssetCaches,
  readSaved,
  setImageAssetStore,
  storeImageAsset,
  writeSaved,
} from '../../src/state'
import { createFakeIndexedDb } from '../support/fakeIndexedDb'

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

describe('portable project save with image assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setImageAssetStore(null)
    clearImageAssetCaches()
    Reflect.deleteProperty(window, 'showSaveFilePicker')
  })

  it('waits for stored images and embeds them in the saved project file', async () => {
    const image = 'data:image/png;base64,' + 'P'.repeat(4000)
    vi.stubGlobal('indexedDB', createFakeIndexedDb())
    setImageAssetStore(null)
    clearImageAssetCaches()
    const ref = await storeImageAsset(image)
    writeSaved('canvas', {
      modifiers: [{ id: 'pattern-1', kind: 'pattern', params: { image: ref } }],
    })

    const write = vi.fn()
    Object.assign(window, {
      showSaveFilePicker: async () => ({
        name: 'portable.json',
        createWritable: async () => ({ write, close: async () => {} }),
      }),
    })
    render(<SaveControls />)
    // Shift asks for a file, even if an earlier test picked one in this module.
    fireEvent.click(screen.getByRole('button', { name: 'menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'save' }), { shiftKey: true })
    expect(await screen.findByText(/saved portable\.json/)).toBeInTheDocument()
    const file = JSON.parse(write.mock.calls[0]?.[0] as string)
    expect(file.canvas.modifiers[0].params.image).toBe(image)
  })

  it('reports a missing image instead of saving a broken project', async () => {
    writeSaved('canvas', {
      modifiers: [{ id: 'pattern-1', kind: 'pattern', params: { image: 'rgd-asset:missing' } }],
    })
    render(<SaveControls />)
    fireEvent.click(screen.getByRole('button', { name: 'menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'save' }))
    expect(await screen.findByText(/couldn't save: .*Missing image asset/)).toBeInTheDocument()
  })
})
