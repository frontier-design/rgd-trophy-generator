import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import {
  createModifier,
  DEFAULT_LIGHTING,
  modifiersByScene,
  sceneMaterial,
  type LightingNode,
} from '../../src/components/CanvasPage/graph'
import { DEFAULT_MATERIAL } from '../../src/state'

const own = { ...DEFAULT_MATERIAL, palette: 'gold' as const, lightAngle: 10, highlight: 0.2 }
const linkedMaterial = { ...DEFAULT_MATERIAL, palette: 'silver' as const, lightAngle: 99 }
const light = { ...DEFAULT_LIGHTING, lightAngle: -40, ambient: 0.5 }

describe('lighting node', () => {
  it('a scene with nothing linked draws with its own material', () => {
    expect(sceneMaterial(own, {})).toBe(own)
  })

  it('a material node keeps the scene’s own lighting', () => {
    const material = sceneMaterial(own, { material: linkedMaterial })
    expect(material.palette).toBe('silver')
    expect(material.lightAngle).toBe(10)
    expect(material.highlight).toBe(0.2)
  })

  it('a lighting node overrides the lighting, over the scene or a material node', () => {
    expect(sceneMaterial(own, { lighting: light })).toMatchObject({
      palette: 'gold',
      lightAngle: -40,
      ambient: 0.5,
    })
    expect(sceneMaterial(own, { material: linkedMaterial, lighting: light })).toMatchObject({
      palette: 'silver',
      lightAngle: -40,
    })
  })

  it('links to scenes; the last linked one wins', () => {
    const a = createModifier('lighting', 'lighting-1', 'lighting 1', 0, 0)
    const b: LightingNode = {
      kind: 'lighting',
      id: 'lighting-2',
      name: 'lighting 2',
      x: 0,
      y: 0,
      params: light,
    }
    const byScene = modifiersByScene(
      [
        { from: 'lighting-1', to: 's1' },
        { from: 'lighting-2', to: 's1' },
      ],
      [a, b],
    )
    expect(byScene.get('s1')?.lighting).toBe(light)
  })

  it('saves and loads, numbers over the defaults, and continues its ids', () => {
    const doc = parseCanvasDocument({
      modifiers: [
        {
          id: 'lighting-3',
          kind: 'lighting',
          x: 1,
          y: 2,
          params: { lightAngle: 12, ambient: 'x' },
        },
      ],
    })
    expect(doc.modifiers[0]).toMatchObject({
      kind: 'lighting',
      params: { ...DEFAULT_LIGHTING, lightAngle: 12 },
    })
    expect(doc.inserted.lighting).toBe(3)
  })
})
