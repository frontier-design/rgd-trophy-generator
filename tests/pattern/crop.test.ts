import {
  FULL_CROP,
  MIN_CROP,
  clampCrop,
  cropRegion,
  gray,
  isFullCrop,
  moveCrop,
  resizeCrop,
} from '../../src/pattern'

describe('crop geometry', () => {
  it('defaults to the full image and clamps every crop inside it', () => {
    expect(clampCrop(undefined)).toEqual(FULL_CROP)
    expect(isFullCrop(FULL_CROP)).toBe(true)
    expect(clampCrop({ x: -0.5, y: 1.5, width: 3, height: 0 })).toEqual({
      x: 0,
      y: 1 - MIN_CROP,
      width: 1,
      height: MIN_CROP,
    })
    expect(clampCrop({ x: 0.8, y: 0.7, width: 0.5, height: 0.5 })).toEqual({
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    })
    expect(clampCrop({ x: NaN, y: Infinity, width: -1, height: NaN })).toEqual({
      x: 0,
      y: 0,
      width: MIN_CROP,
      height: 1,
    })
  })

  it('moves the crop without changing its size, kept inside the image', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }
    const moved = moveCrop(crop, 0.1, 0.1)
    expect(moved.x).toBeCloseTo(0.2)
    expect(moved.y).toBeCloseTo(0.3)
    expect(moved.width).toBeCloseTo(0.4)
    expect(moved.height).toBeCloseTo(0.3)
    expect(moveCrop(crop, -1, -1)).toEqual({ x: 0, y: 0, width: 0.4, height: 0.3 })
    expect(moveCrop(crop, 1, 1)).toEqual({ x: 0.6, y: 0.7, width: 0.4, height: 0.3 })
  })

  it('resizes from every corner and edge, keeping the opposite edge and nonzero size', () => {
    const crop = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }
    const se = resizeCrop(crop, 'se', 0.1, 0.1)
    expect([se.x, se.y, se.width, se.height].map((n) => Number(n.toFixed(6)))).toEqual([
      0.2, 0.2, 0.5, 0.5,
    ])
    const nw = resizeCrop(crop, 'nw', 0.1, 0.1)
    expect([nw.x, nw.y, nw.width, nw.height].map((n) => Number(n.toFixed(6)))).toEqual([
      0.3, 0.3, 0.3, 0.3,
    ])
    expect(resizeCrop(crop, 'e', -0.1, 0.5).width).toBeCloseTo(0.3)
    expect(resizeCrop(crop, 'n', 0.5, -0.1).height).toBeCloseTo(0.5)
    const west = resizeCrop(crop, 'w', 1, 0)
    expect(west.x).toBeCloseTo(0.6 - MIN_CROP)
    expect(west.width).toBeCloseTo(MIN_CROP)
    expect(west.height).toBeCloseTo(0.4)
    const south = resizeCrop(crop, 's', 0, 1)
    expect(south.x).toBeCloseTo(0.2)
    expect(south.y).toBeCloseTo(0.2)
    expect(south.width).toBeCloseTo(0.4)
    expect(south.height).toBeCloseTo(0.8)
  })
})

describe('cropRegion', () => {
  // 4 × 2, left half bright: [10 20 | 30 40], [50 60 | 70 80]
  const image = gray(4, 2, Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80]))

  it('returns the image for the full crop', () => {
    expect(cropRegion(image, FULL_CROP)).toBe(image)
    expect(cropRegion(image, undefined)).toBe(image)
  })

  it('copies the selected pixel region', () => {
    const left = cropRegion(image, { x: 0, y: 0, width: 0.5, height: 1 })
    expect([left.width, left.height, ...left.data]).toEqual([2, 2, 10, 20, 50, 60])
    const right = cropRegion(image, { x: 0.5, y: 0, width: 0.5, height: 1 })
    expect([right.width, right.height, ...right.data]).toEqual([2, 2, 30, 40, 70, 80])
    const corner = cropRegion(image, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 })
    expect([corner.width, corner.height, ...corner.data]).toEqual([2, 1, 70, 80])
  })

  it('keeps at least one pixel for a tiny crop', () => {
    const tiny = cropRegion(image, { x: 0.99, y: 0.99, width: 0.001, height: 0.001 })
    expect([tiny.width, tiny.height]).toEqual([1, 1])
  })
})
