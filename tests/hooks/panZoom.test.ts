import { fitView, zoomAt } from '../../src/hooks'

describe('fitView', () => {
  it('centers the frame at the largest zoom that fits, padding clear', () => {
    const view = fitView({ width: 1000, height: 700 }, { width: 1920, height: 1080 }, 50)
    expect(view.zoom).toBeCloseTo(900 / 1920)
    expect(view.x).toBeCloseTo(50)
    expect(view.y).toBeCloseTo((700 - 1080 * view.zoom) / 2)
  })
})

describe('zoomAt', () => {
  const limits = { min: 0.1, max: 4 }

  it('keeps the point under the cursor in place', () => {
    const view = { x: 100, y: 50, zoom: 0.5 }
    const point = { x: 400, y: 300 }
    // The frame point under the cursor before…
    const frameX = (point.x - view.x) / view.zoom
    const next = zoomAt(view, 2, point, limits)
    expect(next.zoom).toBe(1)
    // …is still under it after.
    expect(next.x + frameX * next.zoom).toBeCloseTo(point.x)
  })

  it('stays within the limits', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 3 }, 10, { x: 0, y: 0 }, limits).zoom).toBe(4)
    expect(zoomAt({ x: 0, y: 0, zoom: 0.2 }, 0.01, { x: 0, y: 0 }, limits).zoom).toBe(0.1)
  })
})
