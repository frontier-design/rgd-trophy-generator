import { gradientRamp, gradientSpan, paletteStops } from '../../src/material'
import { lineBoxes } from '../../src/rag'
import { createPaperScene } from '../../src/shape2d'

const lines = [
  { index: 0, text: 'RGD', width: 30 },
  { index: 1, text: 'BRANDING', width: 80 },
]
const look = { gradientOffset: 0, gradientScale: 1, banding: 1 }
const style = {
  gradient: gradientRamp(paletteStops('slate'), look),
  span: gradientSpan(look),
  tilt: 0,
}

describe('PaperScene mirror', () => {
  it('draws the shape and its reflection across the edge; the outline is one half', () => {
    const scene = createPaperScene(document.createElement('canvas'))
    const boxes = lineBoxes(lines, { lineHeight: 10, padX: 0, padY: 0, radius: 0 })
    const input = {
      boxes,
      edgeX: 100,
      extent: { left: 0, top: 0, bottom: 20 },
      topCornerRadius: 0,
      taper: 0,
      joinRadius: 0,
    }

    const outline = scene.showRag({ ...input, mirror: true }, style)
    const [shape, reflection] = scene.scope.project.activeLayer.children
    expect(reflection).toBeDefined()
    // The original spans 30–100 (RGD's rag to the edge); the reflection 100–170.
    expect(shape!.bounds.left).toBeCloseTo(30)
    expect(reflection!.bounds.left).toBeCloseTo(100)
    expect(reflection!.bounds.right).toBeCloseTo(170)
    // Only the original half goes to 3D.
    const xs = outline.contours.flat().map((p) => p.x)
    expect(Math.max(...xs)).toBeCloseTo(100)

    scene.showRag({ ...input, mirror: false }, style)
    expect(scene.scope.project.activeLayer.children).toHaveLength(1)
    scene.dispose()
  })
})
