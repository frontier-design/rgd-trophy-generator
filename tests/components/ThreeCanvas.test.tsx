import { render } from '@testing-library/react'
import { createRef, StrictMode } from 'react'
import { ThreeCanvas } from '../../src/components/ThreeCanvas'
import { DEFAULT_MATERIAL } from '../../src/state'

// jsdom has no WebGL: test only the React lifecycle.
const scene = {
  setOutline: vi.fn(),
  setAnchor: vi.fn(),
  setProjection: vi.fn(),
  setLook: vi.fn(),
  setMirror: vi.fn(),
  setTwists: vi.fn(),
  setEtches: vi.fn(),
  setTextures: vi.fn(),
  setPatterns: vi.fn(),
  playRevolve: vi.fn(),
  resize: vi.fn(),
  setPixelRatio: vi.fn(),
  render: vi.fn(),
  snapshot: vi.fn(),
  dispose: vi.fn(),
}
vi.mock('../../src/render3d', () => ({ createThreeScene: vi.fn(() => scene) }))
const { createThreeScene } = await import('../../src/render3d')

describe('ThreeCanvas under StrictMode', () => {
  it('creates, plays and disposes a scene per mount', () => {
    const { container, unmount } = render(
      <StrictMode>
        <ThreeCanvas
          outline={{ contours: [] }}
          axisX={100}
          anchorRef={createRef()}
          look={DEFAULT_MATERIAL}
          mirror
          animateIn
          pixelRatio={1}
        />
      </StrictMode>,
    )
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    expect(scene.setOutline).toHaveBeenCalled()
    expect(scene.setProjection).toHaveBeenCalledWith('orthographic')
    expect(scene.setLook).toHaveBeenCalledWith(DEFAULT_MATERIAL)
    expect(scene.setMirror).toHaveBeenCalledWith(true)
    unmount()
    expect(createThreeScene).toHaveBeenCalledTimes(2)
    expect(scene.playRevolve).toHaveBeenCalledTimes(2)
    expect(scene.dispose).toHaveBeenCalledTimes(2)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('draws visual changes and anchor movement, but not unrelated commits', () => {
    const anchor = document.createElement('div')
    let left = 10
    vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(
      () => ({ left, top: 20, width: 100, height: 100 }) as DOMRect,
    )
    const anchorRef = { current: anchor }
    const outline = { contours: [] }
    const props = {
      outline,
      axisX: 100,
      anchorRef,
      look: DEFAULT_MATERIAL,
      mirror: false,
      animateIn: false,
      pixelRatio: 1,
    }
    const { rerender } = render(<ThreeCanvas {...props} />)
    scene.render.mockClear()
    rerender(<ThreeCanvas {...props} />)
    expect(scene.render).not.toHaveBeenCalled()

    rerender(<ThreeCanvas {...props} projection="perspective" />)
    expect(scene.render).toHaveBeenCalledTimes(1)
    expect(scene.setProjection).toHaveBeenLastCalledWith('perspective')
    scene.render.mockClear()
    const nextOutline = { contours: [] }
    rerender(<ThreeCanvas {...props} outline={nextOutline} />)
    expect(scene.render).toHaveBeenCalledTimes(1)
    scene.render.mockClear()
    left = 30
    rerender(<ThreeCanvas {...props} outline={nextOutline} />)
    expect(scene.setAnchor).toHaveBeenLastCalledWith(30, 20)
    expect(scene.render).toHaveBeenCalledTimes(1)
    scene.render.mockClear()
    rerender(<ThreeCanvas {...props} outline={nextOutline} />)
    expect(scene.render).not.toHaveBeenCalled()
  })

  it('shows the finished solid without a sweep unless animating in', () => {
    vi.clearAllMocks()
    render(
      <ThreeCanvas
        outline={{ contours: [] }}
        axisX={100}
        anchorRef={createRef()}
        look={DEFAULT_MATERIAL}
        mirror={false}
        animateIn={false}
        pixelRatio={1}
      />,
    )
    expect(scene.playRevolve).not.toHaveBeenCalled()
    expect(scene.setMirror).toHaveBeenCalledWith(false)
  })
})
