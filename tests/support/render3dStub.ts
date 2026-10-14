// jsdom has no WebGL. Tests that render the whole App (which shows the 3D view by default)
// replace render3d/ with this stub:
//   vi.mock('../../src/render3d', () => import('../support/render3dStub'))
import type { ThreeScene } from '../../src/render3d'

export function createThreeScene(): ThreeScene {
  return {
    setOutline: () => {},
    setAnchor: () => {},
    setLook: () => {},
    setProjection: () => {},
    setMirror: () => {},
    playRevolve: () => {},
    resize: () => {},
    dispose: () => {},
  }
}
