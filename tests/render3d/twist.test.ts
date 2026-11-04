import { DEFAULT_TWIST } from '../../src/components/CanvasPage/graph'
import { buildLathe } from '../../src/render3d/lathe'
import { twistDeform, twistScale, twistShape } from '../../src/render3d/twist'
import type { TwistParams } from '../../src/types'

const params: TwistParams = { ...DEFAULT_TWIST, flutes: 8, depth: 20, twist: 90, sharpness: 50 }
const TOP = 100
const HEIGHT = 200
const shape = (patch: Partial<TwistParams> = {}) => twistShape({ ...params, ...patch })
/** The angle of flute k's middle (t = 2πk) at height share 0 with no twist. */
const lobe = (k: number) => (2 * Math.PI * k) / 8

describe('twistScale', () => {
  it('keeps lobes at the full radius and cuts grooves in by the depth', () => {
    const s = shape({ twist: 0 })
    expect(twistScale(s, 0.5, lobe(1))).toBeCloseTo(1)
    // Halfway between lobes (t = π): the crease.
    expect(twistScale(s, 0.5, lobe(1) + Math.PI / 8)).toBeCloseTo(0.8, 2)
    for (let phi = 0; phi < 2 * Math.PI; phi += 0.1) {
      const m = twistScale(s, 0.5, phi)
      expect(m).toBeLessThanOrEqual(1 + 1e-9)
      expect(m).toBeGreaterThanOrEqual(0.8 - 1e-9)
    }
  })

  it('cuts narrow grooves into flat ribs with the grooves section', () => {
    const s = shape({ twist: 0, section: 'grooves', sharpness: 100 })
    expect(twistScale(s, 0.5, lobe(1) + Math.PI / 8)).toBeCloseTo(0.8)
    // Most of each flute is rib, at the full radius.
    expect(twistScale(s, 0.5, lobe(1))).toBeCloseTo(1)
    expect(twistScale(s, 0.5, lobe(1) + Math.PI / 32)).toBeGreaterThan(0.99)
  })

  it('turns the pattern by the twist from the top to the bottom', () => {
    const s = shape()
    // (Exactly on the band's ends the scale is 1; just inside them:)
    expect(twistScale(s, 0.001, 0)).toBeCloseTo(1)
    // The lobe at φ = 0 on top sits at φ = −90° at the bottom.
    expect(twistScale(s, 0.999, -Math.PI / 2)).toBeCloseTo(1)
    // …and a crease sits halfway between lobes there.
    expect(twistScale(s, 0.999, -Math.PI / 2 + Math.PI / 8)).toBeLessThan(0.85)
  })

  it('bends the turn with curve: slower at the top and faster below (positive)', () => {
    const even = shape()
    const curved = shape({ curve: 100 })
    // Halfway down, an even twist has turned 45°; curved fully, a quarter as far (f = v²).
    expect(twistScale(even, 0.5, -Math.PI / 4)).toBeCloseTo(1)
    expect(twistScale(curved, 0.5, -Math.PI / 8)).toBeCloseTo(1)
    // Both end at the same turn.
    expect(twistScale(curved, 0.9999, -Math.PI / 2)).toBeCloseTo(1)
  })

  it('only flutes the band between from and to', () => {
    const s = shape({ twist: 0, from: 30, to: 60 })
    const crease = lobe(1) + Math.PI / 8
    expect(twistScale(s, 0.2, crease)).toBe(1)
    expect(twistScale(s, 0.7, crease)).toBe(1)
    expect(twistScale(s, 0.45, crease)).toBeCloseTo(0.8, 2)
  })

  it('fades in at ends inside the trophy, or closes each cut in a round arch', () => {
    const crease = lobe(1) + Math.PI / 8
    const fade = shape({ twist: 0, from: 20, to: 80, ends: 'fade', endSize: 10 })
    // Halfway into the fade: half the depth (smoothstep).
    expect(twistScale(fade, 0.25, crease)).toBeCloseTo(0.9, 2)

    const round = shape({ twist: 0, from: 20, to: 80, ends: 'round', endSize: 10 })
    // Near the end the cut has narrowed: beside the crease it's already the full radius…
    const beside = crease - (Math.PI / 8) * 0.75
    expect(twistScale(round, 0.23, beside)).toBeCloseTo(1)
    expect(twistScale(round, 0.4, beside)).toBeLessThan(0.99)
    // …while the crease itself is still cut, so each cut closes in a rounded tip.
    expect(twistScale(round, 0.23, crease)).toBeLessThan(0.85)
    // Around the whole ring the surface still reaches the full radius: the silhouette goes on.
    for (const v of [0.205, 0.23, 0.26]) {
      const most = Math.max(
        ...Array.from({ length: 360 }, (_, i) => twistScale(round, v, (i * Math.PI) / 180)),
      )
      expect(most).toBeCloseTo(1)
    }
  })

  it('runs the flutes off the trophy’s top and bottom with no end size (rim included)', () => {
    const s = shape({ twist: 0, ends: 'round', endSize: 0 })
    const crease = lobe(1) + Math.PI / 8
    expect(twistScale(s, 0, crease)).toBeCloseTo(0.8, 2)
    expect(twistScale(s, 0.01, crease)).toBeCloseTo(0.8, 2)
    expect(twistScale(s, 1, crease)).toBeCloseTo(0.8, 2)
  })

  it('with an end size, ends the flutes before the trophy’s top and bottom too', () => {
    const crease = lobe(1) + Math.PI / 8
    const fade = shape({ twist: 0, ends: 'fade', endSize: 20 })
    expect(twistScale(fade, 0, crease)).toBe(1)
    expect(twistScale(fade, 0.1, crease)).toBeCloseTo(0.9, 2)
    expect(twistScale(fade, 0.9, crease)).toBeCloseTo(0.9, 2)
    expect(twistScale(fade, 0.5, crease)).toBeCloseTo(0.8, 2)
    // Round: near the rim each cut has narrowed to a tip around its crease.
    const round = shape({ twist: 0, ends: 'round', endSize: 20 })
    expect(twistScale(round, 0.03, crease - (Math.PI / 8) * 0.75)).toBeCloseTo(1)
    expect(twistScale(round, 0.03, crease)).toBeLessThan(0.85)
  })

  it('never leaves a step at a band end, even with no end size', () => {
    const s = shape({ twist: 0, from: 40, to: 100, endSize: 0 })
    const crease = lobe(1) + Math.PI / 8
    expect(twistScale(s, 0.4001, crease)).toBeGreaterThan(0.99)
    expect(twistScale(s, 0.42, crease)).toBeCloseTo(0.8, 2)
  })

  it('leaves the radius alone at depth 0', () => {
    expect(twistScale(shape({ depth: 0 }), 0.4, 1.3)).toBe(1)
  })

  it('maps the sliders to the shader’s units', () => {
    expect(shape({ flutes: 7.6, sharpness: 0, from: 70, to: 20 })).toMatchObject({
      flutes: 8,
      depth: 0.2,
      exponent: 2,
      from: 0.2,
      to: 0.7,
      round: 0,
      grooves: 0,
    })
    expect(shape({ sharpness: 100 }).exponent).toBeLessThan(1)
    expect(shape({ sharpness: 100, section: 'grooves' }).exponent).toBeGreaterThan(10)
  })
})

describe('twistDeform', () => {
  it('multiplies twists over the solid’s height', () => {
    const a = shape()
    const b = shape({ flutes: 3, twist: -40, rotate: 20 })
    const deform = twistDeform([a, b], TOP, HEIGHT)
    expect(deform).not.toBeNull()
    const v = (y: number) => (TOP - y) / HEIGHT
    expect(deform?.(0.7, 10)).toBeCloseTo(twistScale(a, v(10), 0.7) * twistScale(b, v(10), 0.7))
    expect(twistDeform([], TOP, HEIGHT)).toBeNull()
  })
})

describe('buildLathe with a twist', () => {
  // A cylinder wall: radius 50 from y = −100 up to y = 100 (bottom to top, so its normals
  // face outward, as the trophy's profiles do).
  const wall = Array.from({ length: 21 }, (_, i) => ({ x: 50, y: -100 + i * 10 }))
  const ledge = wall.map(() => 0)
  const deform = twistDeform([shape({ sharpness: 0 })], TOP, HEIGHT)

  it('scales each vertex’s radius and keeps its height', () => {
    const geometry = buildLathe(wall, ledge, 64, 0, Math.PI * 2, deform)
    const position = geometry.getAttribute('position')
    for (let v = 0; v < position.count; v += 37) {
      const x = position.getX(v)
      const y = position.getY(v)
      const z = position.getZ(v)
      expect(Math.hypot(x, z)).toBeCloseTo(50 * (deform?.(Math.atan2(x, z), y) ?? NaN), 3)
      expect(y).toBeCloseTo(wall[v % wall.length]?.y ?? NaN)
    }
  })

  it('keeps the undeformed normals, and the profile normal for the shader’s exact ones', () => {
    const plain = buildLathe(wall, ledge, 64, 0, Math.PI * 2)
    const twisted = buildLathe(wall, ledge, 64, 0, Math.PI * 2, deform)
    expect(Array.from(twisted.getAttribute('normal').array)).toEqual(
      Array.from(plain.getAttribute('normal').array),
    )
    expect(twisted.getAttribute('aProfileNormal').getX(0)).toBeCloseTo(1)
    expect(plain.getAttribute('aProfileNormal')).toBeUndefined()
  })
})
