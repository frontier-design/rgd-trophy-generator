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

  it('repeat: the image itself, the strip’s height (fold around: mirrored pairs)', () => {
    const plain = buildPatternMap(sample, { ...DEFAULT_PATTERN, mode: 'repeat', fold: 'none' }).map
    expect(plain?.height).toBe(192)
    const folded = buildPatternMap(sample, {
      ...DEFAULT_PATTERN,
      mode: 'repeat',
      fold: 'around',
    }).map
    expect(folded?.width).toBe((plain?.width ?? 0) * 2)
    // Seamless: the pair's two ends match.
    const row = (m: typeof folded, y: number) => m?.data.subarray(y * m.width, (y + 1) * m.width)
    const r = row(folded, 96)
    expect(r?.[0]).toBe(r?.[(folded?.width ?? 1) - 1])
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
