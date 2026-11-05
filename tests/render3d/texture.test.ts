import { DEFAULT_TEXTURE } from '../../src/components/CanvasPage/graph'
import { MAX_TEXTURES, textureShape } from '../../src/render3d'
import { TEXTURE_STYLES } from '../../src/render3d/texture'

describe('textureShape', () => {
  it('converts a node’s fields to the shader’s units', () => {
    expect(
      textureShape({
        ...DEFAULT_TEXTURE,
        style: 'brushed',
        scale: 12,
        strength: 50,
        angle: 90,
        seed: 3,
        from: 80,
        to: 20,
        fade: 10,
        depthTop: 100,
        depthBottom: 0,
      }),
    ).toEqual({
      style: TEXTURE_STYLES.brushed,
      scale: 12,
      strength: 0.5,
      angle: Math.PI / 2,
      seed: 3,
      from: 0.2,
      to: 0.8,
      fade: 0.1,
      depthTop: 1,
      depthBottom: 0,
    })
  })

  it('keeps values in range: features at least half a px, seeds 0–255', () => {
    const shape = textureShape({ ...DEFAULT_TEXTURE, scale: 0, strength: 300, fade: 90, seed: -1 })
    expect(shape.scale).toBe(0.5)
    expect(shape.strength).toBe(1)
    expect(shape.fade).toBe(0.5)
    expect(shape.seed).toBe(255)
    expect(MAX_TEXTURES).toBeGreaterThanOrEqual(4)
  })
})
