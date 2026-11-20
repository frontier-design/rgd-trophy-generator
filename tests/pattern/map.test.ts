import {
  autocrop,
  blur,
  buildPatternMap,
  contrast,
  gray,
  landscape,
  prepareSample,
  resize,
} from '../../src/pattern'
import { fold } from '../../src/pattern/map'
import { DEFAULT_PATTERN } from '../../src/components/CanvasPage/graph'

const g = (w: number, h: number, values: number[]) => gray(w, h, Uint8Array.from(values))

describe('grid helpers', () => {
  it('crops off dark margins', () => {
    const cropped = autocrop(g(4, 3, [0, 0, 0, 0, 0, 200, 90, 0, 0, 0, 0, 0]), 24)
    expect([cropped.width, cropped.height, ...cropped.data]).toEqual([2, 1, 200, 90])
  })

  it('turns tall images so their long side runs around', () => {
    const turned = landscape(g(1, 3, [1, 2, 3]))
    expect([turned.width, turned.height, ...turned.data]).toEqual([3, 1, 1, 2, 3])
    expect(landscape(g(3, 1, [1, 2, 3])).width).toBe(3)
  })

  it('resizes by averaging down and interpolating up', () => {
    expect([...resize(g(4, 1, [0, 100, 200, 100]), 2, 1).data]).toEqual([50, 150])
    const up = resize(g(2, 1, [0, 200]), 4, 1)
    expect(up.data[0]).toBe(0)
    expect(up.data[3]).toBe(200)
    expect(up.data[1]).toBeGreaterThan(0)
  })

  it('pushes toward black and white, and inverts', () => {
    expect([...contrast(g(3, 1, [10, 128, 250]), 128, 20, false).data]).toEqual([0, 128, 255])
    expect(contrast(g(1, 1, [250]), 128, 20, true).data[0]).toBe(0)
  })

  it('blurs, wrapping across when asked', () => {
    const line = g(8, 1, [255, 0, 0, 0, 0, 0, 0, 0])
    expect(blur(line, 1, true).data[7]).toBeGreaterThan(0)
    expect(blur(line, 1, false).data[7]).toBe(0)
  })

  it('folds a map across its middle line and around', () => {
    const map = g(2, 2, [1, 2, 3, 4])
    expect([...fold(map, 'across').data]).toEqual([1, 2, 1, 2])
    const around = fold(map, 'around')
    expect([around.width, ...around.data]).toEqual([4, 1, 2, 2, 1, 3, 4, 4, 3])
    expect(fold(map, 'none')).toBe(map)
  })
})

describe('buildPatternMap', () => {
  // A small ornament: bright dots on black, in a tall strip with margins.
  const image = gray(12, 40)
  for (let y = 4; y < 36; y++)
    for (let x = 3; x < 9; x++) image.data[y * 12 + x] = (x + y) % 3 === 0 ? 255 : 0
  const sample = prepareSample(image)

  it('prepares the image: cropped, running around', () => {
    expect(sample.width).toBeGreaterThan(sample.height)
  })

  it('repeat: the image at its own resolution, never upscaled (fold around: mirrored pairs)', () => {
    const plain = buildPatternMap(sample, { ...DEFAULT_PATTERN, mode: 'repeat', fold: 'none' }).map
    expect(plain?.height).toBe(sample.height)
    const folded = buildPatternMap(sample, {
      ...DEFAULT_PATTERN,
      mode: 'repeat',
      fold: 'around',
    }).map
    expect(folded?.width).toBe((plain?.width ?? 0) * 2)
    // Seamless: the pair's two ends match.
    const row = (m: typeof folded, y: number) => m?.data.subarray(y * m.width, (y + 1) * m.width)
    const r = row(folded, Math.floor((folded?.height ?? 0) / 2))
    expect(r?.[0]).toBe(r?.[(folded?.width ?? 1) - 1])
  })

  it('repeat: large images keep up to 512 px across the strip (4096 around)', () => {
    const big = gray(1200, 3000)
    for (let y = 0; y < 3000; y++)
      for (let x = 100; x < 1100; x++) big.data[y * 1200 + x] = (x * y) % 7 ? 200 : 0
    const map = buildPatternMap(big, {
      ...DEFAULT_PATTERN,
      mode: 'repeat',
      fold: 'none',
      softness: 0,
    }).map
    // Turned to run around: 3000 × 1000 → 512 tall would be 1536 wide.
    expect(map?.height).toBe(512)
    expect(map?.width).toBeLessThanOrEqual(4096)
  })

  it('generate: a new map in the image’s style, folded', () => {
    const params = {
      ...DEFAULT_PATTERN,
      mode: 'generate' as const,
      detail: 8,
      length: 12,
      size: 2,
      fold: 'around' as const,
    }
    const { map, message } = buildPatternMap(sample, params)
    expect(map).not.toBeNull()
    expect(message).toMatch(/pieces/)
    // Cells × 6 px, doubled by the fold around.
    expect(map?.width).toBe(12 * 6 * 2)
    expect(map?.height).toBe(8 * 6)
  })
})

describe('image mode', () => {
  it('uses the image as is: no cropping, turning or contrast (its brightness the height)', () => {
    // A tall image with dark margins and a soft gradient: kept exactly.
    const image = gray(
      4,
      8,
      Uint8Array.from({ length: 32 }, (_, i) => i * 8),
    )
    const { map, message } = buildPatternMap(image, {
      ...DEFAULT_PATTERN,
      mode: 'image',
      softness: 0,
    })
    expect([map?.width, map?.height]).toEqual([4, 8])
    expect([...(map?.data ?? [])]).toEqual([...image.data])
    expect(message).toMatch(/as is/)
  })

  it('inverts and fits large images to a texture', () => {
    const big = gray(4096, 1024, new Uint8Array(4096 * 1024).fill(10))
    const { map } = buildPatternMap(big, {
      ...DEFAULT_PATTERN,
      mode: 'image',
      invert: true,
      softness: 0,
    })
    expect([map?.width, map?.height]).toEqual([2048, 512])
    expect(map?.data[0]).toBe(245)
  })
})

describe('crop', () => {
  it('feeds only the selected region to the pattern, without trimming that choice away', () => {
    // Bright left half, dark right half: the full image's margins trim to the left half.
    const image = gray(40, 20)
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) image.data[y * 40 + x] = 255
    const full = buildPatternMap(image, {
      ...DEFAULT_PATTERN,
      mode: 'repeat',
      fold: 'none',
      softness: 0,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    }).map
    expect(full?.data.some((value) => value > 0)).toBe(true)

    // Selecting the dark half keeps exactly that region: no automatic trim, no ornament.
    const cropped = buildPatternMap(image, {
      ...DEFAULT_PATTERN,
      mode: 'repeat',
      fold: 'none',
      softness: 0,
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
    }).map
    expect(cropped?.data.every((value) => value === 0)).toBe(true)

    // Selecting the bright half is a smaller map than the whole image's trimmed one.
    const left = buildPatternMap(image, {
      ...DEFAULT_PATTERN,
      mode: 'repeat',
      fold: 'none',
      softness: 0,
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
    }).map
    expect(left?.data.some((value) => value > 0)).toBe(true)
    expect(left?.data).not.toEqual(cropped?.data)
  })
})
