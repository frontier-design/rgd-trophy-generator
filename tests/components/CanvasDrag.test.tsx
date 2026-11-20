import { act, fireEvent, render, screen } from '@testing-library/react'
import { createElement, type Ref } from 'react'
import { CanvasPage } from '../../src/components/CanvasPage'

vi.mock('../../src/render3d', () => import('../support/render3dStub'))

const { sceneArtboardRender } = vi.hoisted(() => ({
  sceneArtboardRender: vi.fn(),
}))

vi.mock('../../src/components/SceneArtboard', () => ({
  SceneArtboard: sceneArtboardRender.mockImplementation(
    ({ artboardRef }: { artboardRef?: Ref<HTMLDivElement> }) =>
      createElement('div', { ref: artboardRef, className: 'artboard' }),
  ),
}))

type Frame = { id: number; callback: FrameRequestCallback }

let frames: Frame[]
let nextFrame: number

const canvas = () => screen.getByRole('region', { name: 'Canvas' })

function installRaf() {
  frames = []
  nextFrame = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++
    frames.push({ id, callback })
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames = frames.filter((frame) => frame.id !== id)
  })
}

function flushRaf() {
  const queued = frames.splice(0)
  act(() => {
    queued.forEach(({ callback }) => callback(performance.now()))
  })
}

async function settleArtwork() {
  // Let useSceneModel/font measurement and its effects settle without fake timers.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350))
  })
}

async function insertScene() {
  fireEvent.contextMenu(canvas(), { clientX: 200, clientY: 150 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert scene' }))
  return screen.findByLabelText(/^scene \d+$/)
}

function insertTwist() {
  fireEvent.contextMenu(canvas(), { clientX: 40, clientY: 40 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'insert twist' }))
  return screen.getByRole('group', { name: 'twist 1' })
}

function link(from: Element, to: Element) {
  fireEvent.pointerDown(from, { button: 0, pointerId: 7 })
  fireEvent.pointerUp(to, { pointerId: 7 })
}

beforeEach(installRaf)
afterEach(() => vi.unstubAllGlobals())

describe('CanvasPage drag previews', () => {
  it('moves a scene through a transient transform without rendering its artwork, then commits the latest sample', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    await settleArtwork()
    sceneArtboardRender.mockClear()

    const before = { left: scene.style.left, top: scene.style.top }
    fireEvent.pointerDown(scene, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(scene, { pointerId: 1, clientX: 60, clientY: 30 })
    flushRaf()

    expect(scene.style.left).toBe(before.left)
    expect(scene.style.top).toBe(before.top)
    expect(scene.style.transform).toBe('translate(50px, 20px)')
    expect(sceneArtboardRender).not.toHaveBeenCalled()

    // The final pointer sample is newer than the flushed frame. It must still be saved.
    fireEvent.pointerMove(scene, { pointerId: 1, clientX: 80, clientY: 40 })
    fireEvent.pointerUp(scene, { pointerId: 1 })

    expect(scene.style.left).toBe(`${parseFloat(before.left) + 70}px`)
    expect(scene.style.top).toBe(`${parseFloat(before.top) + 30}px`)
    expect(scene.style.transform).toBe('')
    expect(sceneArtboardRender).not.toHaveBeenCalled()
  })

  it('moves a linked modifier preview and keeps the live edge attached to both preview positions', async () => {
    const { container } = render(<CanvasPage tools={null} />)
    await insertScene()
    const twist = insertTwist()
    link(screen.getByLabelText('twist 1 output'), screen.getByLabelText('scene 1 input'))
    await settleArtwork()
    sceneArtboardRender.mockClear()

    const path = () => container.querySelector('.node-links path') as SVGPathElement
    const beforePath = path().getAttribute('d')
    const card = twist
    const wrapper = twist.closest('[data-canvas-node]') as HTMLElement
    const before = { left: wrapper.style.left, top: wrapper.style.top }

    fireEvent.pointerDown(card, { button: 0, pointerId: 2, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(card, { pointerId: 2, clientX: 90, clientY: 55 })
    flushRaf()

    expect(wrapper.style.left).toBe(before.left)
    expect(wrapper.style.top).toBe(before.top)
    expect(wrapper.style.transform).toBe('translate(70px, 35px)')
    expect(path().getAttribute('d')).not.toBe(beforePath)
    expect(sceneArtboardRender).not.toHaveBeenCalled()

    // Escape cancels the drag: the card and its edge go back.
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(card, { pointerId: 2 })
    expect(wrapper.style.transform).toBe('')
    expect(wrapper.style.left).toBe(before.left)
    expect(path().getAttribute('d')).toBe(beforePath)
  })

  it('Escape cancels a scene drag, a cut-short one still drops, and a drag is one undo step', async () => {
    render(<CanvasPage tools={null} />)
    const scene = await insertScene()
    await settleArtwork()
    const original = { left: scene.style.left, top: scene.style.top }

    fireEvent.pointerDown(scene, { button: 0, pointerId: 3, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(scene, { pointerId: 3, clientX: 40, clientY: 25 })
    flushRaf()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(scene, { pointerId: 3 })
    expect(scene.style.left).toBe(original.left)
    expect(scene.style.top).toBe(original.top)
    expect(scene.style.transform).toBe('')

    // The browser cutting the gesture short (pointercancel) still drops it.
    fireEvent.pointerDown(scene, { button: 0, pointerId: 5, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(scene, { pointerId: 5, clientX: 20, clientY: 10 })
    flushRaf()
    fireEvent.pointerCancel(scene, { pointerId: 5 })
    expect(scene.style.left).not.toBe(original.left)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(scene.style.left).toBe(original.left)

    fireEvent.pointerDown(scene, { button: 0, pointerId: 4, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(scene, { pointerId: 4, clientX: 30, clientY: 15 })
    flushRaf()
    fireEvent.pointerUp(scene, { pointerId: 4 })
    const committed = { left: scene.style.left, top: scene.style.top }
    expect(committed.left).not.toBe(original.left)

    // Let the drag settle, then undo should restore exactly the pre-drag document.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(scene.style.left).toBe(original.left)
    expect(scene.style.top).toBe(original.top)
    expect(scene.style.transform).toBe('')
  })
})
