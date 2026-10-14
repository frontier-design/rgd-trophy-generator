import {
  lightDirection,
  litFrontRamp,
  litLuminance,
  paletteStops,
  rgbToOklch,
} from '../../src/material'
import { DEFAULT_MATERIAL } from '../../src/state'

const look = DEFAULT_MATERIAL
const close = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z].map((c) => +c.toFixed(6))

describe('lightDirection', () => {
  it('0° is the front, +90° the right, and height raises it', () => {
    expect(close(lightDirection(0, 0))).toEqual([0, 0, 1])
    expect(close(lightDirection(90, 0))).toEqual([1, 0, 0])
    expect(close(lightDirection(0, 90))).toEqual([0, 1, 0])
  })
})

describe('litLuminance', () => {
  const toward = lightDirection(look.lightAngle, look.lightHeight)

  it('is brighter facing the light than facing away (shadow side keeps the ambient)', () => {
    const lit = litLuminance(toward, look)
    const away = litLuminance({ x: -toward.x, y: -toward.y, z: -toward.z }, look)
    expect(lit).toBeGreaterThan(away)
    expect(litLuminance({ x: -1, y: 0, z: 0 }, { ...look, ambient: 0.3, softness: 0 })).toBeCloseTo(
      0.3 * (1 - look.edgeDepth * 0.5),
    )
  })

  it('highlight strength adds light; a bigger highlight reaches further off its peak', () => {
    const front = { x: 0, y: 0, z: 1 }
    expect(litLuminance(front, { ...look, highlight: 1 })).toBeGreaterThan(
      litLuminance(front, { ...look, highlight: 0 }),
    )
    const offPeak = { x: -0.4, y: 0, z: 0.9 }
    const spec = (highlightSize: number) =>
      litLuminance(offPeak, { ...look, highlightSize }) -
      litLuminance(offPeak, { ...look, highlightSize, highlight: 0 })
    expect(spec(1)).toBeGreaterThan(spec(0))
  })
})

describe('litFrontRamp (the 2D sketch in lit mode)', () => {
  const stops = paletteStops('studio')
  const ramp = litFrontRamp(stops, look)

  it('spans the front, silhouette to silhouette', () => {
    expect(ramp.at(0)?.offset).toBe(0)
    expect(ramp.at(-1)?.offset).toBe(1)
  })

  it('is darker on the side away from a right-hand light', () => {
    const lightness = (offset: number) =>
      rgbToOklch(ramp[Math.round(offset * (ramp.length - 1))]!.color).l
    expect(lightness(0.2)).toBeLessThan(lightness(0.8))
  })
})
