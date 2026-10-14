import { describe, expect, it } from 'vitest'
import { joinFillets } from '../../src/shape2d'
import type { LineBox, Point2 } from '../../src/types'

const box = (lineIndex: number, x: number, y: number, width: number, height: number, radius = 0) =>
  ({ lineIndex, x, y, width, height, radius }) satisfies LineBox

const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y)

describe('joinFillets', () => {
  it('rounds the right angle where a narrower box overlaps the wider one below', () => {
    // Narrow box (right side x = 100, bottom 80) over a wider one starting at y = 50.
    const [fillet] = joinFillets([box(0, 0, 0, 100, 80, 10), box(1, 0, 50, 300, 80, 10)], 16)
    expect(fillet).toBeDefined()
    expect(fillet?.corner).toEqual({ x: 100, y: 50 })
    expect(fillet?.radius).toBe(16)
    expect(fillet?.center).toEqual({ x: 116, y: 34 })
    // Tangent to the narrow box's right side and to the wide box's top.
    expect(fillet?.start).toEqual({ x: 100, y: 34 })
    expect(fillet?.end).toEqual({ x: 116, y: 50 })
  })

  it('mirrors the fillet when the wider box is above', () => {
    const [fillet] = joinFillets([box(0, 0, 0, 300, 80, 10), box(1, 0, 50, 100, 80, 10)], 16)
    expect(fillet?.corner).toEqual({ x: 100, y: 80 })
    expect(fillet?.center).toEqual({ x: 116, y: 96 })
    expect(fillet?.start).toEqual({ x: 100, y: 96 })
    expect(fillet?.end).toEqual({ x: 116, y: 80 })
  })

  it('is externally tangent to a rounded corner when boxes barely touch (the cusp)', () => {
    const rN = 24
    const [fillet] = joinFillets([box(0, 0, 0, 100, 80, rN), box(1, 0, 80, 300, 80, rN)], 16)
    expect(fillet).toBeDefined()
    const s = fillet?.radius ?? 0
    const arcCenter = { x: 100 - rN, y: 80 - rN }
    const center = fillet?.center ?? { x: 0, y: 0 }
    expect(dist(center, arcCenter)).toBeCloseTo(rN + s)
    expect(dist(fillet?.start ?? center, arcCenter)).toBeCloseTo(rN)
    expect(dist(fillet?.start ?? center, center)).toBeCloseTo(s)
    expect(center.y).toBeCloseTo(80 - s)
    expect(fillet?.end.y).toBeCloseTo(80)
    // The cusp sits where the corner arc meets the edge: its bottom point.
    expect(fillet?.corner.x).toBeCloseTo(100 - rN)
  })

  it('shrinks the radius so the fillet ends before the wider box curves', () => {
    // The wide box is only 20px wider, with a 10px corner radius: at most 10px of edge.
    const [fillet] = joinFillets([box(0, 0, 0, 100, 80, 10), box(1, 0, 50, 120, 80, 10)], 40)
    expect(fillet?.radius).toBeCloseTo(10, 3)
  })

  it("splits a narrower box's side between joins at both its ends", () => {
    // A 60px-tall narrow box between two wider ones: joins at y = 20 and y = 50.
    const fillets = joinFillets(
      [box(0, 0, -40, 300, 60), box(1, 0, 10, 100, 60), box(2, 0, 50, 300, 60)],
      40,
    )
    expect(fillets).toHaveLength(2)
    // Each reaches at most to the halfway point (y = 35) between the joins.
    expect(fillets[0]?.start.y).toBeCloseTo(35, 3)
    expect(fillets[1]?.start.y).toBeCloseTo(35, 3)
  })

  it('skips gaps, equal widths and a zero radius', () => {
    expect(joinFillets([box(0, 0, 0, 100, 40), box(1, 0, 50, 300, 40)], 16)).toEqual([])
    expect(joinFillets([box(0, 0, 0, 100, 80), box(1, 0, 50, 100, 80)], 16)).toEqual([])
    expect(joinFillets([box(0, 0, 0, 100, 80), box(1, 0, 50, 300, 80)], 0)).toEqual([])
  })
})
