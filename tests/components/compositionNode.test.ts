import {
  IMAGE_CORNERS,
  resizeCompositionImage,
} from '../../src/components/CanvasPage/compositionNode'

const start = { x: 10, y: 20, width: 100, height: 80 }

describe('resizeCompositionImage', () => {
  it.each([
    ['top-left', { x: 30, y: 30, width: 80, height: 70 }],
    ['top-right', { x: 10, y: 30, width: 120, height: 70 }],
    ['bottom-right', { x: 10, y: 20, width: 120, height: 90 }],
    ['bottom-left', { x: 30, y: 20, width: 80, height: 90 }],
  ] as const)('resizes %s around the opposite corner', (corner, expected) => {
    expect(resizeCompositionImage(start, corner, 20, 10)).toEqual(expected)
    expect(start).toEqual({ x: 10, y: 20, width: 100, height: 80 })
  })

  it.each(IMAGE_CORNERS)('clamps crossed dimensions to one pixel for %s', (corner) => {
    const dx = corner.endsWith('left') ? 500 : -500
    const dy = corner.startsWith('top') ? 500 : -500
    const result = resizeCompositionImage(start, corner, dx, dy)
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    expect(corner.endsWith('left') ? result.x + result.width : result.x).toBe(
      corner.endsWith('left') ? 110 : 10,
    )
    expect(corner.startsWith('top') ? result.y + result.height : result.y).toBe(
      corner.startsWith('top') ? 100 : 20,
    )
  })
})
