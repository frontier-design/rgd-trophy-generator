import paper from 'paper'
import { lineBoxes } from '../../src/rag'
import {
  pathToOutline,
  ragShapeFromBoxes,
  topBandGeometry,
  topCornerRadiusFor,
} from '../../src/shape2d'
import type { LineBox, ShapeExtent } from '../../src/types'

const lines = [
  { index: 0, text: 'RGD', width: 30 },
  { index: 1, text: 'BRANDING', width: 80 },
  { index: 2, text: 'AWARDS', width: 60 },
]

function setup() {
  const scope = new paper.PaperScope()
  scope.setup(new scope.Size(400, 200))
  return scope
}

const round = (n: number) => Math.round(n * 1000) / 1000
/** The boxes' own vertical span from the text's left side, raised by `topHeight`. */
function boxExtent(boxes: LineBox[], topHeight = 0): ShapeExtent {
  return {
    left: 0,
    top: Math.min(...boxes.map((b) => b.y)) - topHeight,
    bottom: Math.max(...boxes.map((b) => b.y + b.height)),
  }
}

const outlineOf = (
  scope: paper.PaperScope,
  boxes = lineBoxes(lines, style()),
  edgeX = 100,
  extent = boxExtent(boxes),
) => {
  const shape = ragShapeFromBoxes(scope, boxes, { edgeX, extent })
  if (!shape) throw new Error('expected a shape')
  return pathToOutline(shape).contours.map((c) => c.map((p) => [round(p.x), round(p.y)]))
}
function style(padX = 0, padY = 0, radius = 0) {
  return { lineHeight: 10, padX, padY, radius }
}

describe('ragShapeFromBoxes', () => {
  it('is null without boxes', () => {
    const extent = { left: 0, top: 0, bottom: 10 }
    expect(ragShapeFromBoxes(setup(), [], { edgeX: 100, extent })).toBeNull()
  })

  it('without padding or radius, is the stepped negative space of the rag', () => {
    const [contour, ...rest] = outlineOf(setup())
    expect(rest).toHaveLength(0)
    const sorted = [...(contour ?? [])].sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!)
    expect(sorted).toEqual([
      [30, 0],
      [100, 0],
      [30, 10],
      [80, 10],
      [60, 20],
      [80, 20],
      [60, 30],
      [100, 30],
    ])
  })

  it('padding moves the steps and extends the shape vertically', () => {
    const [contour] = outlineOf(setup(), lineBoxes(lines, style(5, 2)))
    const xs = contour!.map((p) => p[0]!)
    const ys = contour!.map((p) => p[1]!)
    expect(Math.min(...xs)).toBe(35) // RGD 30 + padX
    expect(Math.min(...ys)).toBe(-2)
    expect(Math.max(...ys)).toBe(32)
  })

  it('rounded boxes give curved steps (more points after flattening)', () => {
    const square = outlineOf(setup())[0]!.length
    const rounded = outlineOf(setup(), lineBoxes(lines, style(0, 0, 4)))[0]!.length
    expect(rounded).toBeGreaterThan(square)
  })

  it('boxes past the edge split the shape into separate regions', () => {
    const contours = outlineOf(setup(), lineBoxes(lines, style()), 70) // BRANDING (80) > 70
    expect(contours.length).toBe(2)
  })

  it("the top band spans the full width, from the text's left side to the edge", () => {
    const boxes = lineBoxes(lines, style())
    const [contour] = outlineOf(setup(), boxes, 100, boxExtent(boxes, 15))
    const top = contour!.filter((p) => p[1] === -15).map((p) => p[0])
    expect(top.sort((a, b) => a! - b!)).toEqual([0, 100])
    // Where the band meets the first line, the shape steps in to the line's end.
    expect(contour).toContainEqual([0, 0])
    expect(contour).toContainEqual([30, 0])
  })

  it('stops at the given bottom (the last baseline), clipping the last row', () => {
    const boxes = lineBoxes(lines, style())
    const [contour] = outlineOf(setup(), boxes, 100, { ...boxExtent(boxes), bottom: 27 })
    expect(Math.max(...contour!.map((p) => p[1]!))).toBe(27)
  })

  it("starts at the text's left side, not the padded boxes' left", () => {
    // padX 6: boxes start at x = -6, but the top band (no box) starts at the text, x = 0.
    const boxes = lineBoxes(lines, style(6))
    const [contour] = outlineOf(setup(), boxes, 100, boxExtent(boxes, 15))
    expect(Math.min(...contour!.map((p) => p[0]!))).toBe(0)
  })

  describe('rounded top band corner', () => {
    const boxes = lineBoxes(lines, style())
    const extent = boxExtent(boxes, 15) // band from y = -15 down to the first box at y = 0

    const contourWith = (topCornerRadius: number) => {
      const shape = ragShapeFromBoxes(setup(), boxes, { edgeX: 100, extent, topCornerRadius })
      if (!shape) throw new Error('expected a shape')
      return pathToOutline(shape).contours[0]!.map((p) => [round(p.x), round(p.y)])
    }

    it('is square without a radius', () => {
      expect(contourWith(0)).toContainEqual([0, 0])
    })

    it("rounds the band's bottom-left corner into an arc", () => {
      const contour = contourWith(6)
      expect(contour).not.toContainEqual([0, 0])
      // The arc runs from (0, -6) to (6, 0), bulging toward the corner.
      const onArc = contour.filter(([x, y]) => x! > 0 && x! < 6 && y! > -6 && y! < 0)
      expect(onArc.length).toBeGreaterThan(0)
      for (const [x, y] of onArc) expect(Math.hypot(x! - 6, y! + 6)).toBeCloseTo(6, 0)
      // The left edge above the arc is untouched.
      expect(Math.min(...contour.map((p) => p[0]!))).toBe(0)
    })

    it('caps the radius at the band height and its bottom edge length', () => {
      expect(topCornerRadiusFor(boxes, extent, 100)).toBeCloseTo(15) // band height
      expect(topCornerRadiusFor(boxes, { ...extent, top: -60 }, 100)).toBeCloseTo(30) // RGD's width
    })

    it('does nothing without a top band', () => {
      expect(topCornerRadiusFor(boxes, boxExtent(boxes), 10)).toBe(0)
    })
  })
})

describe('outline flattening for 3D', () => {
  it('follows rounded corners closely: ~16 segments per quarter circle at r = 40', () => {
    const scope = setup()
    const rounded = new scope.Path.Rectangle({
      rectangle: new scope.Rectangle(0, 0, 200, 100),
      radius: 40,
      insert: false,
    })
    const [contour] = pathToOutline(rounded).contours
    // 4 rounded corners + straight sides.
    const perCorner = (contour!.length - 4) / 4
    expect(perCorner).toBeGreaterThanOrEqual(12)
    // Every flattened point stays on the true arc (within the tolerance).
    const corner = contour!.filter((p) => p.x < 40 && p.y < 40)
    for (const p of corner) expect(Math.abs(Math.hypot(p.x - 40, p.y - 40) - 40)).toBeLessThan(0.06)
  })
})

describe('tapered top band', () => {
  const boxes = lineBoxes(lines, style())
  const extent = { left: 0, top: -40, bottom: 30 } // band from y = -40 to the first box at 0

  const contourWith = (taper: number, topCornerRadius = 0) => {
    const shape = ragShapeFromBoxes(setup(), boxes, { edgeX: 100, extent, taper, topCornerRadius })
    if (!shape) throw new Error('expected a shape')
    return pathToOutline(shape).contours[0]!.map((p) => [round(p.x), round(p.y)])
  }

  it('narrows the top: at taper 0.5 the top edge starts halfway to the axis', () => {
    const topXs = contourWith(0.5)
      .filter(([, y]) => y === -40)
      .map(([x]) => x!)
    expect(Math.min(...topXs)).toBe(50) // left 0 + 0.5 × (100 − 0)
    expect(Math.max(...topXs)).toBe(100)
  })

  it("keeps the band's bottom at full width (the side slants)", () => {
    expect(contourWith(0.5)).toContainEqual([0, 0])
  })

  it('fillets the sharper corner tangent to both edges', () => {
    const band = topBandGeometry(boxes, extent, { edgeX: 100, taper: 0.5, cornerRadius: 6 })
    const fillet = band?.fillet
    if (!fillet) throw new Error('expected a fillet')
    // Start sits on the bottom edge, end on the slanted side (from (0,0) toward (50,−40)).
    expect(fillet.start.y).toBeCloseTo(0)
    expect(fillet.end.x / -fillet.end.y).toBeCloseTo(50 / 40)
    // Both tangent points are the same distance from the corner (a symmetric fillet).
    expect(Math.hypot(fillet.start.x, fillet.start.y)).toBeCloseTo(
      Math.hypot(fillet.end.x, fillet.end.y),
    )
    // And the shape has no sharp corner at (0, 0) any more.
    expect(contourWith(0.5, 6)).not.toContainEqual([0, 0])
  })

  it('caps the fillet so it never runs past the visible bottom edge', () => {
    // RGD's box is 30 wide: the fillet's tangent point can't go past x = 30.
    const band = topBandGeometry(boxes, extent, { edgeX: 100, taper: 0.5, cornerRadius: 500 })
    expect(band?.fillet?.start.x).toBeLessThanOrEqual(30 + 1e-9)
  })
})

describe('regression: tapered band with real-world boxes', () => {
  // From the app (size 53.1, pad 25/9, radius 19, top 300, edge 352). With taper, the
  // fillet used to end exactly where the first box's curve starts, and uniting the band
  // with the already-carved region failed silently (empty shape).
  const boxes = [
    { lineIndex: 0, x: -25, y: -9, width: 166.4482879638672, height: 73.7, radius: 19 },
    { lineIndex: 1, x: -25, y: 46.7, width: 329.57147216796875, height: 73.7, radius: 19 },
    { lineIndex: 2, x: -25, y: 102.4, width: 272.7013702392578, height: 73.7, radius: 19 },
    { lineIndex: 3, x: -25, y: 158.1, width: 172.07684326171875, height: 73.7, radius: 19 },
  ]
  const extent = { left: 0, top: -309, bottom: 218.45 }

  it.each([0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.9])('gives one solid shape at taper %s', (taper) => {
    for (const topCornerRadius of [0, 30, 100]) {
      const shape = ragShapeFromBoxes(setup(), boxes, {
        edgeX: 352,
        extent,
        topCornerRadius,
        taper,
      })
      expect(shape).not.toBeNull()
      expect(pathToOutline(shape!).contours).toHaveLength(1)
    }
  })
})

describe('smooth joins', () => {
  // Like the app's defaults (size 53, pad 15/15, radius 24, edge 375): the boxes overlap by
  // 30px, so RGD's right side meets BRANDING's top in a sharp right angle at (125, 38).
  const boxes = lineBoxes(
    [
      { index: 0, text: 'RGD', width: 110 },
      { index: 1, text: 'BRANDING', width: 270 },
      { index: 2, text: 'AWARDS', width: 210 },
      { index: 3, text: '2027', width: 130 },
    ],
    { lineHeight: 53, padX: 15, padY: 15, radius: 24 },
  )
  const extent = { left: 0, top: -15, bottom: 205 }
  const shapeWith = (joinRadius: number) =>
    ragShapeFromBoxes(setup(), boxes, { edgeX: 375, extent, joinRadius })
  // PathItem's types omit `area` (Path and CompoundPath both have it).
  const areaOf = (shape: paper.PathItem) => (shape as paper.Path).area
  const nearest = (shape: paper.PathItem, x: number, y: number) =>
    Math.min(
      ...pathToOutline(shape)
        .contours.flat()
        .map((p) => Math.hypot(p.x - x, p.y - y)),
    )

  it.each([0, 8, 16, 40, 100])('stays one solid shape at join radius %s', (joinRadius) => {
    const shape = shapeWith(joinRadius)
    expect(shape).not.toBeNull()
    expect(pathToOutline(shape!).contours).toHaveLength(1)
  })

  it('replaces the sharp corners with fillets', () => {
    const sharp = shapeWith(0)!
    const smooth = shapeWith(16)!
    expect(nearest(sharp, 125, 38)).toBeLessThan(0.01)
    // A 16px fillet's arc passes 16(√2 − 1) ≈ 6.6px from the corner it replaces.
    expect(nearest(smooth, 125, 38)).toBeCloseTo(16 * (Math.SQRT2 - 1), 0)
    // Material is removed, never added.
    expect(Math.abs(areaOf(smooth))).toBeLessThan(Math.abs(areaOf(sharp)))
  })
})
