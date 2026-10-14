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
  playRevolve: vi.fn(),
  resize: vi.fn(),
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
      />,
    )
    expect(scene.playRevolve).not.toHaveBeenCalled()
    expect(scene.setMirror).toHaveBeenCalledWith(false)
  })
})
