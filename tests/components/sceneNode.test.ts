import {
  canvasSceneDefaults,
  createSceneNode,
  sceneParams,
  withParams,
} from '../../src/components/CanvasPage/sceneNode'
import { DEFAULT_SCENE_PARAMS, DEFAULT_SETTINGS } from '../../src/state'

const measure = { widest: 260, lineCount: 4, metrics: { ascent: 42, descent: 11 } }

describe('canvas scenes', () => {
  it('start without the banner, the generator’s defaults otherwise until measured', () => {
    const { settings, scene } = canvasSceneDefaults()
    expect(settings).toEqual(DEFAULT_SETTINGS)
    expect(scene).toEqual({ ...DEFAULT_SCENE_PARAMS, banner: false })
  })

  it('fit the reference layout once measured: bigger type to the margins, a rounded top', () => {
    const { settings, scene } = canvasSceneDefaults(measure)
    expect(scene.banner).toBe(false)
    expect(settings.fontSize).toBeGreaterThan(DEFAULT_SETTINGS.fontSize)
    expect(settings.columnWidth).toBe(1920 / 2 - 60)
    expect(scene.mirror).toBe(true)
    expect(scene.topHeight).toBeGreaterThan(0)
    expect(scene.roundTop).toBe(true)
    // The boxes keep their proportions to the type.
    const scale = settings.fontSize / DEFAULT_SETTINGS.fontSize
    expect(scene.lineBox.padX).toBeCloseTo(DEFAULT_SCENE_PARAMS.lineBox.padX * scale)
    expect(scene.lineBox.radius).toBeCloseTo(DEFAULT_SCENE_PARAMS.lineBox.radius * scale)
  })

  it('split control panel edits between settings and scene params', () => {
    const node = createSceneNode('a', 'scene 1', 10, 20)
    const edited = withParams(node, { fontSize: 80, taper: 30 })
    expect(edited.settings.fontSize).toBe(80)
    expect(edited.settings.text).toBe(node.settings.text)
    expect(edited.scene.taper).toBe(30)
    expect(sceneParams(edited)).toMatchObject({ fontSize: 80, taper: 30, banner: false })
    expect(edited).toMatchObject({ id: 'a', x: 10, y: 20 })
  })
})

describe('scene frames', () => {
  it('fit the text and trophy to a new frame size', async () => {
    const { fitSceneToFrame, FRAME_PRESETS } =
      await import('../../src/components/CanvasPage/sceneNode')
    const node = createSceneNode('s', 'scene 1', 0, 0, measure)
    expect(node.frame).toEqual({ width: 1920, height: 1080 })
    const square = fitSceneToFrame(node, { width: 1080, height: 1080 })
    expect(square.frame).toEqual({ width: 1080, height: 1080 })
    // The edge is the frame's middle, inside the margin.
    expect(square.settings.columnWidth).toBe(1080 / 2 - 60)
    expect(FRAME_PRESETS.map((p) => p.label)).toContain('1:1 · 1080 × 1080')
  })
})

describe('resizing a frame by its edges', () => {
  it('keeps the opposite edge put, whole px within limits, and the ratio with Shift', async () => {
    const { resizeFrame } = await import('../../src/components/CanvasPage/sceneNode')
    const start = { x: 100, y: 200, width: 1920, height: 1080 }
    expect(resizeFrame(start, 'right', 80.4, 0)).toEqual({ ...start, width: 2000 })
    expect(resizeFrame(start, 'left', 120, 0)).toEqual({
      x: 220,
      y: 200,
      width: 1800,
      height: 1080,
    })
    expect(resizeFrame(start, 'top', 0, -20)).toEqual({ x: 100, y: 180, width: 1920, height: 1100 })
    expect(resizeFrame(start, 'bottom', 0, -5000).height).toBe(256)
    expect(resizeFrame(start, 'right', -960, 0, true)).toEqual({
      ...start,
      width: 960,
      height: 540,
    })
  })
})
