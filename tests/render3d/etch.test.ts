import { DEFAULT_ETCH as NEW_ETCH } from '../../src/components/CanvasPage/graph'

// The math's fixtures: a diagonal, crosshatched strip on the bowl (independent of the node's
// defaults, which follow how etches get used).
const DEFAULT_ETCH = {
  ...NEW_ETCH,
  from: 4,
  to: 32,
  bundles: 8,
  lines: 4,
  width: 1.2,
  strength: 85,
  layout: 'diagonal',
} satisfies typeof NEW_ETCH
import { etchDistance, etchShape, MAX_ETCH_LINES } from '../../src/render3d/etch'
import type { EtchParams } from '../../src/types'

const shape = (patch: Partial<EtchParams> = {}) =>
  etchShape({ ...DEFAULT_ETCH, from: 0, to: 100, bundles: 4, lines: 1, slant: 90, ...patch })
const period = (2 * Math.PI) / 4

describe('etchShape', () => {
  it('maps the fields to the shader’s units', () => {
    expect(
      etchShape({ ...DEFAULT_ETCH, from: 80, to: 20, lines: 20, style: 'dark' }),
    ).toMatchObject({
      from: 0.2,
      to: 0.8,
      lines: MAX_ETCH_LINES,
      cross: 1,
      style: -1,
    })
  })
})

describe('etch styles', () => {
  it('cut (the default) is 0 for the shader, inlays ±1', () => {
    expect(etchShape(DEFAULT_ETCH).style).toBe(0)
    expect(etchShape({ ...DEFAULT_ETCH, style: 'bright' }).style).toBe(1)
  })
})

describe('etch layouts', () => {
  it('runs vertical lines straight down, whatever the slant', () => {
    const s = shape({ layout: 'vertical', slant: 200 })
    for (const v of [0, 0.4, 1]) expect(etchDistance(s, 0.5 * period, v, 1)).toBeCloseTo(0)
  })

  it('rings the trophy with horizontal lines, and adds vertical ones with cross', () => {
    const s = shape({ layout: 'horizontal', bundles: 4, from: 0, to: 100 })
    // Ring k sits at strip share (k + 0.5) / 4, at any angle.
    for (const phi of [0, 1.3, 4]) expect(etchDistance(s, phi, 0.625, 1)).toBeCloseTo(0)
    expect(etchDistance(s, 0, 0.5, 1)).toBeCloseTo(0.5)
    // Its counterpart: straight lines around.
    expect(etchDistance(s, 0.5 * period, 0.3, -1)).toBeCloseTo(0)
  })

  it('zigzags out and back, and waves, by the slant', () => {
    const zig = shape({ layout: 'zigzag', slant: 90, waves: 1 })
    const start = 0.5 * period
    // Out to the full swing halfway down, back by the bottom.
    expect(etchDistance(zig, start, 0, 1)).toBeCloseTo(0)
    expect(etchDistance(zig, start + Math.PI / 2, 0.5, 1)).toBeCloseTo(0)
    expect(etchDistance(zig, start, 0.999, 1)).toBeCloseTo(0, 2)
    const wave = shape({ layout: 'wave', slant: 90, waves: 1 })
    // A quarter wave down: the full (half-slant) swing, mirrored by the cross set.
    expect(etchDistance(wave, start + Math.PI / 4, 0.25, 1)).toBeCloseTo(0)
    expect(etchDistance(wave, start - Math.PI / 4, 0.25, -1)).toBeCloseTo(0)
  })

  it('maps fade and depths', () => {
    expect(etchShape({ ...DEFAULT_ETCH, fade: 80, depthTop: 100, depthBottom: 25 })).toMatchObject({
      fade: 0.5,
      depthTop: 1,
      depthBottom: 0.25,
      layout: 0,
    })
  })
})

describe('etchDistance', () => {
  it('puts one line in the middle of each bundle’s period, repeating around', () => {
    const s = shape({ slant: 0 })
    for (let k = 0; k < 4; k++) expect(etchDistance(s, (k + 0.5) * period, 0.3, 1)).toBeCloseTo(0)
    expect(etchDistance(s, period, 0.3, 1)).toBeCloseTo(0.5)
  })

  it('winds the lines by the slant over the strip, the cross direction the other way', () => {
    const s = shape()
    const start = 0.5 * period
    // At the strip's bottom the line has turned 90° (one way or the other).
    expect(etchDistance(s, start + Math.PI / 2, 1, 1)).toBeCloseTo(0)
    expect(etchDistance(s, start - Math.PI / 2, 1, -1)).toBeCloseTo(0)
    expect(etchDistance(s, start + Math.PI / 4, 0.5, 1)).toBeCloseTo(0)
  })

  it('spaces a bundle’s lines by the gap, centered in its period', () => {
    const s = shape({ slant: 0, lines: 3, gap: 10 })
    for (const offset of [-0.1, 0, 0.1]) {
      expect(etchDistance(s, (0.5 + offset) * period, 0.5, 1)).toBeCloseTo(0)
    }
    expect(etchDistance(s, (0.5 + 0.05) * period, 0.5, 1)).toBeCloseTo(0.05)
  })

  it('only etches the strip', () => {
    const s = shape({ from: 30, to: 60, slant: 0 })
    expect(etchDistance(s, 0.5 * period, 0.2, 1)).toBe(Infinity)
    expect(etchDistance(s, 0.5 * period, 0.7, 1)).toBe(Infinity)
    expect(etchDistance(s, 0.5 * period, 0.45, 1)).toBeCloseTo(0)
  })
})

describe('patternPlacement', () => {
  it('maps a pattern node’s fields to the shader’s units', async () => {
    const { patternPlacement } = await import('../../src/render3d/pattern')
    const { DEFAULT_PATTERN: NEW_PATTERN } = await import('../../src/components/CanvasPage/graph')
    const DEFAULT_PATTERN = { ...NEW_PATTERN, from: 6, to: 30, mapping: 'strip', fade: 25 } as const
    expect(
      patternPlacement({
        ...DEFAULT_PATTERN,
        from: 50,
        to: 10,
        fade: 80,
        style: 'cut',
        depthTop: 100,
        depthBottom: 20,
        scale: 50,
        shapeScale: 60,
        angle: 90,
      }),
    ).toEqual({
      from: 0.1,
      to: 0.5,
      // Half size: twice the repeats around.
      repeats: DEFAULT_PATTERN.repeats * 2,
      scale: 0.5,
      shapeScale: 0.6,
      surface: 0,
      angle: Math.PI / 2,
      spin: 0,
      style: 1,
      strength: DEFAULT_PATTERN.strength / 100,
      fade: 0.5,
      depthTop: 1,
      depthBottom: 0.2,
    })
  })
})

describe('pattern scale', () => {
  it('keeps whole repeats around at any scale', async () => {
    const { patternPlacement } = await import('../../src/render3d/pattern')
    const { DEFAULT_PATTERN: NEW_PATTERN } = await import('../../src/components/CanvasPage/graph')
    const DEFAULT_PATTERN = { ...NEW_PATTERN, from: 6, to: 30, mapping: 'strip', fade: 25 } as const
    const at = (scale: number) =>
      patternPlacement({ ...DEFAULT_PATTERN, repeats: 3, scale }).repeats
    expect(at(100)).toBe(3)
    expect(at(40)).toBe(8)
    expect(at(400)).toBe(1)
  })
})
