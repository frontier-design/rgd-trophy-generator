import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import {
  DEFAULT_MASTER_PARAMS,
  masterFromScene,
  withMaster,
} from '../../src/components/CanvasPage/master'
import { createSceneNode } from '../../src/components/CanvasPage/sceneNode'

const scene = (id: string, x = 0, y = 0) => createSceneNode(id, id, x, y)

describe('master node', () => {
  it('applies its settings to a scene, leaving the scene’s own ones alone', () => {
    const node = scene('scene-1')
    const next = withMaster(node, {
      ...DEFAULT_MASTER_PARAMS,
      taper: 40,
      grain: 0.9,
      background: '#000000',
      perspective: true,
    })
    expect(next.scene.taper).toBe(40)
    expect(next.settings.material.grain).toBe(0.9)
    expect(next.scene.canvasColors.background).toBe('#000000')
    expect(next.perspective).toBe(true)
    // Per scene: text, palette, lighting, text color.
    expect(next.settings.text).toBe(node.settings.text)
    expect(next.settings.material.lightAngle).toBe(node.settings.material.lightAngle)
    expect(next.scene.canvasColors.text).toBe(node.scene.canvasColors.text)
  })

  it('returns the same scene when it already has the master’s settings', () => {
    const node = scene('scene-1')
    expect(withMaster(node, masterFromScene(node))).toBe(node)
  })

  it('plays the sweep when it switches scenes back to 3D', () => {
    const flat = withMaster(scene('scene-1'), { ...DEFAULT_MASTER_PARAMS, revolve: false })
    expect(flat.revolve).toBe(false)
    const back = withMaster(flat, { ...DEFAULT_MASTER_PARAMS, revolve: true })
    expect(back).toMatchObject({ revolve: true, animateRevolve: true })
  })

  it('starts from the first scene on a canvas saved without one, beside the scenes', () => {
    const first = withMaster(scene('scene-1', 500, 200), {
      ...DEFAULT_MASTER_PARAMS,
      taper: 25,
    })
    const doc = parseCanvasDocument({ scenes: [first, scene('scene-2', 900, 100)] })
    expect(doc.master.params.taper).toBe(25)
    expect(doc.master.x).toBeLessThan(500)
    expect(doc.master.y).toBe(100)
    // Applied to every scene on load.
    expect(doc.scenes.map((node) => node.scene.taper)).toEqual([25, 25])
  })

  it('loads a saved master over the defaults and applies it', () => {
    const doc = parseCanvasDocument({
      scenes: [scene('scene-1')],
      master: { x: 10, y: 20, collapsed: true, params: { grain: 0.1, taper: 'bad' } },
    })
    expect(doc.master).toMatchObject({ id: 'master', x: 10, y: 20, collapsed: true })
    expect(doc.master.params.grain).toBe(0.1)
    expect(doc.master.params.taper).toBe(DEFAULT_MASTER_PARAMS.taper)
    expect(doc.scenes[0]?.settings.material.grain).toBe(0.1)
  })
})
