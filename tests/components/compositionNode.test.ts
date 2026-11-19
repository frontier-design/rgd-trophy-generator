import {
  IMAGE_CORNERS,
  resizeCompositionImage,
} from '../../src/components/CanvasPage/compositionNode'

const start = { x: 10, y: 20, width: 100, height: 80 }

describe('resizeCompositionImage', () => {
  const ratio = start.width / start.height
  // The far corner of each, which stays put.
  const anchor = {
    'top-left': { x: 110, y: 100 },
    'top-right': { x: 10, y: 100 },
    'bottom-right': { x: 10, y: 20 },
    'bottom-left': { x: 110, y: 20 },
  } as const
  const pinned = (corner: (typeof IMAGE_CORNERS)[number], r: typeof start) => ({
    x: corner.endsWith('left') ? r.x + r.width : r.x,
    y: corner.startsWith('top') ? r.y + r.height : r.y,
  })

  it.each(IMAGE_CORNERS)('grows %s around the opposite corner, keeping the ratio', (corner) => {
    const out = { x: corner.endsWith('left') ? -20 : 20, y: corner.startsWith('top') ? -10 : 10 }
    const result = resizeCompositionImage(start, corner, out.x, out.y)
    expect(result.width / result.height).toBeCloseTo(ratio)
    // The drag projected on the diagonal: 1 + (20·100 + 10·80) / (100² + 80²).
    expect(result.width).toBeCloseTo(100 * (1 + 2800 / 16400))
    const corner0 = pinned(corner, result)
    expect(corner0.x).toBeCloseTo(anchor[corner].x)
    expect(corner0.y).toBeCloseTo(anchor[corner].y)
    expect(start).toEqual({ x: 10, y: 20, width: 100, height: 80 })
  })

  it('keeps the ratio when only one side is pulled, in or out', () => {
    for (const [dx, dy] of [
      [30, 0],
      [0, -25],
      [-40, 5],
    ]) {
      const result = resizeCompositionImage(start, 'bottom-right', dx!, dy!)
      expect(result.width / result.height).toBeCloseTo(ratio)
    }
    expect(resizeCompositionImage(start, 'bottom-right', 30, 0).width).toBeGreaterThan(100)
    expect(resizeCompositionImage(start, 'bottom-right', -30, 0).width).toBeLessThan(100)
  })

  it.each(IMAGE_CORNERS)('stops at one pixel on the shorter side for %s', (corner) => {
    const dx = corner.endsWith('left') ? 500 : -500
    const dy = corner.startsWith('top') ? 500 : -500
    const result = resizeCompositionImage(start, corner, dx, dy)
    expect(result.height).toBeCloseTo(1)
    expect(result.width).toBeCloseTo(ratio)
    const corner0 = pinned(corner, result)
    expect(corner0.x).toBeCloseTo(anchor[corner].x)
    expect(corner0.y).toBeCloseTo(anchor[corner].y)
  })
})
