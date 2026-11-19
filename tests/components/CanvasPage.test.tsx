import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

const canvas = () => screen.getByRole('region', { name: 'Canvas' })

async function insertScene() {
  fireEvent.contextMenu(canvas(), { clientX: 200, clientY: 150 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
  return screen.findByLabelText(/^scene \d+$/)
}

describe('CanvasPage', () => {
  it('right-click → insert scene places a scene, selected, with its controls beside it', async () => {
    render(<CanvasPage tools={null} />)
    expect(screen.getByText('Right-click to insert a scene')).toBeInTheDocument()

    const scene = await insertScene()
    expect(scene).toHaveAttribute('data-selected')
    // The generator's scene: the trophy and the editable text, no banner.
    expect(within(scene).getByTestId('three-view')).toBeInTheDocument()
    expect(within(scene).getByLabelText('Text')).toBeInTheDocument()
    expect(scene.querySelector('.banner')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()

    // Its controls: no animation (keyframes, reveal, timeline) and no banner.
    const panel = screen.getByRole('complementary', { name: 'Control panel' })
    expect(within(panel).getByText('scene 1')).toBeInTheDocument()
    expect(within(panel).getByRole('slider', { name: 'size' })).toBeInTheDocument()
    expect(within(panel).queryByRole('slider', { name: 'reveal' })).toBeNull()
    expect(within(panel).queryByRole('region', { name: 'banner' })).toBeNull()
    expect(within(panel).queryByRole('region', { name: 'timeline' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: /^keyframe/ })).toBeNull()
  })

  it('the master node sets the shared settings of every scene; scene panels leave them out', async () => {
    render(<CanvasPage tools={null} />)
    const first = await insertScene()
    fireEvent.pointerDown(canvas())
    fireEvent.contextMenu(canvas(), { clientX: 900, clientY: 700 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
    const second = await screen.findByLabelText('scene 2')

    const panel = screen.getByRole('complementary', { name: 'Control panel' })
    for (const name of ['taper', 'overshoot', 'grain', 'wobble']) {
      expect(within(panel).queryByRole('slider', { name })).toBeNull()
    }
    expect(within(panel).queryByRole('button', { name: 'debug' })).toBeNull()
    expect(within(panel).getByRole('slider', { name: 'light angle' })).toBeInTheDocument()

    const master = screen.getByRole('group', { name: 'master' })
    // No output port: it applies to every scene without links.
    expect(within(master).queryByLabelText('master output')).toBeNull()
    fireEvent.click(within(master).getByRole('switch', { name: 'mirror' }))
    for (const scene of [first, second]) {
      expect(scene.querySelector('.artboard')).toHaveAttribute('data-mirror', 'off')
    }

    // It can't be deleted.
    fireEvent.pointerDown(master)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.getByRole('group', { name: 'master' })).toBeInTheDocument()
  })

  it('edits only the selected scene', async () => {
    render(<CanvasPage tools={null} />)
    const first = await insertScene()
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
      target: { value: 'HELLO' },
    })
    expect(within(first).getByLabelText('Text')).toHaveValue('HELLO')

    fireEvent.pointerDown(canvas())
    fireEvent.contextMenu(canvas(), { clientX: 900, clientY: 700 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
    const second = await screen.findByLabelText('scene 2')
    expect(within(second).getByLabelText('Text')).not.toHaveValue('HELLO')
    expect(first).not.toHaveAttribute('data-selected')
    expect(second).toHaveAttribute('data-selected')
  })

  it('deselects on the empty canvas, and deletes with the keyboard or the menu', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()

    fireEvent.pointerDown(canvas())
    fireEvent.pointerUp(canvas())
    expect(scene).not.toHaveAttribute('data-selected')
    expect(screen.queryByRole('complementary', { name: 'Control panel' })).toBeNull()

    // Typing in the text never deletes the scene.
    fireEvent.pointerDown(scene)
    fireEvent.keyDown(within(scene).getByLabelText('Text'), { key: 'Backspace' })
    expect(scene).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.queryByLabelText('scene 1')).toBeNull()

    const next = await insertScene()
    fireEvent.contextMenu(next)
    fireEvent.click(screen.getByRole('menuitem', { name: 'delete scene' }))
    expect(screen.queryByLabelText(/^scene \d+$/)).toBeNull()
  })

  it('moves a scene by dragging it', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    const before = { left: parseFloat(scene.style.left), top: parseFloat(scene.style.top) }
    fireEvent.pointerDown(scene, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(scene, { pointerId: 1, clientX: 60, clientY: 30 })
    fireEvent.pointerUp(scene, { pointerId: 1 })
    expect(parseFloat(scene.style.left)).toBeCloseTo(before.left + 50)
    expect(parseFloat(scene.style.top)).toBeCloseTo(before.top + 20)
  })

  describe('twist nodes', () => {
    function insertTwist(clientX = 40, clientY = 40) {
      fireEvent.contextMenu(canvas(), { clientX, clientY })
      fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
    }
    const link = (from: Element, to: Element) => {
      fireEvent.pointerDown(from, { button: 0, pointerId: 2 })
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 300, clientY: 300 })
      fireEvent.pointerUp(to, { pointerId: 2 })
    }

    it('insert from the right-click menu, with their sliders on the node', () => {
      render(<CanvasPage tools={null} />)
      insertTwist()
      const twist = screen.getByRole('group', { name: 'twist 1' })
      for (const name of ['flutes', 'depth', 'twist', 'sharpness', 'rotate']) {
        expect(within(twist).getByRole('slider', { name })).toBeInTheDocument()
      }
      fireEvent.change(within(twist).getByRole('slider', { name: 'flutes' }), {
        target: { value: '20' },
      })
      expect(within(twist).getByRole('slider', { name: 'flutes' })).toHaveValue('20')
    })

    it('link by dragging from an output to a scene’s input, and unlink by picking it up', async () => {
      const { container } = render(<CanvasPage tools={null} />)
      await insertScene()
      insertTwist()
      const output = screen.getByLabelText('twist 1 output')
      const input = screen.getByLabelText('scene 1 input')

      // Dropped on nothing: no link.
      link(output, canvas())
      expect(container.querySelectorAll('.node-links path')).toHaveLength(0)

      link(output, input)
      expect(container.querySelectorAll('.node-links path')).toHaveLength(1)
      expect(input).toHaveAttribute('data-connected')
      expect(output).toHaveAttribute('data-connected')

      // Picked up from the input and dropped on nothing: unlinked.
      link(input, canvas())
      expect(container.querySelectorAll('.node-links path')).toHaveLength(0)
      expect(input).not.toHaveAttribute('data-connected')
    })

    it('deleting a twist drops its links', async () => {
      const { container } = render(<CanvasPage tools={null} />)
      await insertScene()
      insertTwist()
      link(screen.getByLabelText('twist 1 output'), screen.getByLabelText('scene 1 input'))
      expect(container.querySelectorAll('.node-links path')).toHaveLength(1)

      fireEvent.contextMenu(screen.getByRole('group', { name: 'twist 1' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'delete twist' }))
      expect(screen.queryByRole('group', { name: 'twist 1' })).toBeNull()
      expect(container.querySelectorAll('.node-links path')).toHaveLength(0)
      expect(screen.getByLabelText('scene 1 input')).not.toHaveAttribute('data-connected')
    })
  })

  it('etch nodes insert with their fields, link to scenes and save', async () => {
    const { container } = render(<CanvasPage tools={null} />)
    await insertScene()
    fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert etch' }))
    const etch = screen.getByRole('group', { name: 'etch 1' })
    for (const name of [
      'from',
      'to',
      'bundles',
      'lines',
      'gap',
      'thickness',
      'slant',
      'strength',
    ]) {
      expect(within(etch).getByRole('slider', { name })).toBeInTheDocument()
    }
    expect(within(etch).getByRole('switch', { name: 'cross' })).toBeChecked()
    expect(within(etch).getByRole('combobox', { name: 'style' })).toHaveValue('cut')
    // Waves only apply to zigzag and wave layouts.
    expect(within(etch).getByRole('slider', { name: 'waves' })).toBeDisabled()
    fireEvent.change(within(etch).getByRole('combobox', { name: 'layout' }), {
      target: { value: 'wave' },
    })
    expect(within(etch).getByRole('slider', { name: 'waves' })).toBeEnabled()

    fireEvent.pointerDown(screen.getByLabelText('etch 1 output'), { button: 0 })
    fireEvent.pointerUp(screen.getByLabelText('scene 1 input'))
    expect(container.querySelectorAll('.node-links path')).toHaveLength(1)
    expect(screen.getByLabelText('scene 1 input')).toHaveAttribute('data-connected')

    fireEvent.contextMenu(etch)
    expect(screen.getByRole('menuitem', { name: 'delete etch' })).toBeInTheDocument()
  })

  it('pattern nodes insert with their image, map and relief fields', async () => {
    render(<CanvasPage tools={null} />)
    fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert pattern' }))
    const pattern = screen.getByRole('group', { name: 'pattern 1' })
    expect(within(pattern).getByRole('button', { name: 'load image' })).toBeInTheDocument()
    // Repeat (the image itself) by default: the WFC fields don't apply.
    expect(within(pattern).getByRole('combobox', { name: 'mode' })).toHaveValue('repeat')
    expect(within(pattern).getByRole('combobox', { name: 'mapping' })).toHaveValue('surface')
    for (const name of [
      'fade',
      'top depth',
      'bottom depth',
      'repeats',
      'scale',
      'shape scale',
      'spin',
      'angle',
      'detail',
      'length',
      'size',
      'threshold',
      'softness',
      'strength',
    ]) {
      expect(within(pattern).getByRole('slider', { name })).toBeInTheDocument()
    }
    expect(within(pattern).getByRole('slider', { name: 'detail' })).toBeDisabled()
    expect(within(pattern).getByRole('button', { name: 'new seed' })).toBeDisabled()
    expect(within(pattern).getByRole('combobox', { name: 'fold' })).toHaveValue('around')
    // Generate: they do.
    fireEvent.change(within(pattern).getByRole('combobox', { name: 'mode' }), {
      target: { value: 'generate' },
    })
    expect(within(pattern).getByRole('slider', { name: 'detail' })).toBeEnabled()
    expect(within(pattern).getByRole('button', { name: 'new seed' })).toBeEnabled()
    // Image: the image as is, so no threshold or folding.
    fireEvent.change(within(pattern).getByRole('combobox', { name: 'mode' }), {
      target: { value: 'image' },
    })
    expect(within(pattern).getByRole('slider', { name: 'threshold' })).toBeDisabled()
    expect(within(pattern).getByRole('combobox', { name: 'fold' })).toBeDisabled()
    expect(within(pattern).getByRole('slider', { name: 'angle' })).toBeEnabled()
    expect(within(pattern).getByRole('combobox', { name: 'style' })).toHaveValue('raised')
  })

  it('texture nodes insert with their fields (angle for brushed only)', () => {
    render(<CanvasPage tools={null} />)
    fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert texture' }))
    const texture = screen.getByRole('group', { name: 'texture 1' })
    expect(within(texture).getByRole('combobox', { name: 'style' })).toHaveValue('rough')
    for (const name of ['scale', 'strength', 'from', 'to', 'fade', 'top depth', 'bottom depth'])
      expect(within(texture).getByRole('slider', { name })).toBeInTheDocument()
    expect(within(texture).getByRole('slider', { name: 'angle' })).toBeDisabled()
    fireEvent.change(within(texture).getByRole('combobox', { name: 'style' }), {
      target: { value: 'brushed' },
    })
    expect(within(texture).getByRole('slider', { name: 'angle' })).toBeEnabled()
  })

  it('copies, pastes and duplicates nodes (menu and keyboard)', async () => {
    render(<CanvasPage tools={null} />)
    fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert etch' }))
    const etch = screen.getByRole('group', { name: 'etch 1' })
    fireEvent.change(within(etch).getByRole('combobox', { name: 'layout' }), {
      target: { value: 'wave' },
    })
    // Duplicate: a copy beside it, with its settings.
    fireEvent.contextMenu(etch)
    fireEvent.click(screen.getByRole('menuitem', { name: 'duplicate etch' }))
    const copy = screen.getByRole('group', { name: 'etch 2' })
    expect(within(copy).getByRole('combobox', { name: 'layout' })).toHaveValue('wave')
    // Copy, then paste where the menu opens.
    fireEvent.contextMenu(etch)
    fireEvent.click(screen.getByRole('menuitem', { name: 'copy etch' }))
    fireEvent.contextMenu(canvas(), { clientX: 400, clientY: 300 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'paste' }))
    expect(screen.getByRole('group', { name: 'etch 3' })).toBeInTheDocument()

    // Keyboard, on the selected scene: ⌘D duplicates, ⌘C / ⌘V copy and paste.
    await insertScene()
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    expect(await screen.findByLabelText('scene 2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'c', metaKey: true })
    fireEvent.keyDown(window, { key: 'v', metaKey: true })
    expect(await screen.findByLabelText('scene 3')).toBeInTheDocument()
    // Not while typing in a field.
    fireEvent.keyDown(within(screen.getByLabelText('scene 3')).getByLabelText('Text'), {
      key: 'd',
      metaKey: true,
    })
    expect(screen.queryByLabelText('scene 4')).toBeNull()
  })

  it('undoes and redoes with ⌘Z / ⇧⌘Z (not while typing)', async () => {
    render(<CanvasPage tools={null} />)
    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 350)))
    fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert etch' }))
    await settle()
    const etch = screen.getByRole('group', { name: 'etch 1' })
    fireEvent.change(within(etch).getByRole('combobox', { name: 'layout' }), {
      target: { value: 'wave' },
    })
    await settle()
    const layout = () =>
      within(screen.getByRole('group', { name: 'etch 1' })).getByRole('combobox', {
        name: 'layout',
      })
    // Inside a field, its own undo: the canvas's history is left alone.
    fireEvent.keyDown(layout(), { key: 'z', metaKey: true })
    expect(layout()).toHaveValue('wave')
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(layout()).toHaveValue('horizontal')
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(screen.queryByRole('group', { name: 'etch 1' })).toBeNull()
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true })
    expect(layout()).toHaveValue('wave')
  })

  it('node cards fold to their header (and keep it when saved)', () => {
    const first = render(<CanvasPage tools={null} />)
    fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
    const card = screen.getByRole('group', { name: 'twist 1' })
    expect(within(card).getByRole('slider', { name: 'flutes' })).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'collapse twist 1' }))
    expect(within(card).queryByRole('slider', { name: 'flutes' })).toBeNull()
    first.unmount()

    render(<CanvasPage tools={null} />)
    const again = screen.getByRole('group', { name: 'twist 1' })
    expect(within(again).queryByRole('slider', { name: 'flutes' })).toBeNull()
    fireEvent.click(within(again).getByRole('button', { name: 'expand twist 1' }))
    expect(within(again).getByRole('slider', { name: 'flutes' })).toBeInTheDocument()
  })

  it('zoomed far out, node cards show only their headers', () => {
    render(<CanvasPage tools={null} />)
    fireEvent.contextMenu(canvas(), { clientX: 30, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'insert etch' }))
    expect(screen.getByRole('slider', { name: 'bundles' })).toBeInTheDocument()
    // Pinch out (ctrl + wheel) to well below half zoom.
    for (let i = 0; i < 20; i++) {
      fireEvent.wheel(canvas(), { deltaY: 20, ctrlKey: true, clientX: 10, clientY: 10 })
    }
    expect(screen.queryByRole('slider', { name: 'bundles' })).toBeNull()
    expect(screen.getByRole('group', { name: 'etch 1' })).toBeInTheDocument()
  })

  it('a selected scene resizes by its edge handles (and shows its size)', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    const right = within(scene).getByRole('slider', { name: 'resize right' })
    const readout = (axis: string) => scene.querySelector(`.frame-size[data-axis="${axis}"]`)
    expect(readout('width')).toHaveTextContent('1920')
    expect(readout('height')).toHaveTextContent('1080')
    fireEvent.pointerDown(right, { button: 0, pointerId: 3, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(right, { pointerId: 3, clientX: -840, clientY: 0 })
    fireEvent.pointerUp(right, { pointerId: 3 })
    expect(readout('width')).toHaveTextContent('1080')
    expect(scene.style.getPropertyValue('--artboard-width')).toBe('1080px')
    // The frame fields follow.
    const frame = screen.getByRole('region', { name: 'frame' })
    expect(within(frame).getByRole('spinbutton', { name: 'width' })).toHaveValue(1080)
    // A background click deselects; a background drag would keep selection while panning.
    fireEvent.pointerDown(canvas())
    fireEvent.pointerUp(canvas())
    expect(within(scene).queryByRole('slider', { name: 'resize right' })).toBeNull()
  })
})
