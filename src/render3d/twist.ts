// Pure math for the twist node: flutes around the revolved solid that turn as they rise.
// No Three.js here, so it's easy to unit test; lathe.ts applies it to the vertices and
// trophyMaterial.ts mirrors twistScale() in GLSL (keep them in sync).
import type { TwistParams } from '../types'

/** Scales the solid's radius around the axis: at angle φ (the lathe's) and height y, the
 *  radius is r · m(φ, y). */
export type RadialScale = (phi: number, y: number) => number

/** At most this many twist nodes shape one solid (the shader's uniform array size). */
export const MAX_TWISTS = 4
/** Steps around the axis the flutes need to read crisply: this many per flute. */
export const STEPS_PER_FLUTE = 40

/** The section's exponent across a flute, from sharpness 0 → 100: lobes go from a smooth
 *  wave (cos², 2) to round lobes with crisp creases; grooves from a wave to narrow channels. */
const EXPONENT = { lobes: { smooth: 2, sharp: 0.35 }, grooves: { smooth: 2, sharp: 24 } }
/** With round ends, the cuts' depth still fades in over this share of the end. */
const ROUND_EDGE = 0.2
/** Every end inside the trophy is at least this long (a share of its height), so moving a
 *  band's end never leaves a step in the surface. */
const MIN_END = 0.015

/** One twist node's flutes in the units the math uses (shared with the shader). */
export interface TwistShape {
  /** Flutes around (a whole number). */
  flutes: number
  /** Groove depth, a share of the radius (0–0.95). */
  depth: number
  /** Total turn over the band, top to bottom (radians). */
  turn: number
  /** Pattern start angle (radians). */
  rotate: number
  /** The section's exponent (EXPONENT). */
  exponent: number
  /** The band, as shares of the height from the top (from ≤ to). */
  from: number
  to: number
  /** 1 = round ends (arches), 0 = fading ends. */
  round: number
  /** The ends' length, a share of the height. */
  endSize: number
  /** The twist's bend, −1…1. */
  curve: number
  /** 1 = grooves cut into ribs, 0 = lobes. */
  grooves: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const smoothstep = (edge: number, x: number) => {
  if (edge <= 0) return x > 0 ? 1 : 0
  const t = clamp(x / edge, 0, 1)
  return t * t * (3 - 2 * t)
}

/** A twist node's sliders as TwistShape. */
export function twistShape(params: TwistParams): TwistShape {
  const sharpness = clamp(params.sharpness / 100, 0, 1)
  const grooves = params.section === 'grooves'
  const range = grooves ? EXPONENT.grooves : EXPONENT.lobes
  const a = clamp(params.from / 100, 0, 1)
  const b = clamp(params.to / 100, 0, 1)
  return {
    flutes: Math.max(1, Math.round(params.flutes)),
    depth: clamp(params.depth / 100, 0, 0.95),
    turn: (params.twist * Math.PI) / 180,
    rotate: (params.rotate * Math.PI) / 180,
    exponent: range.smooth + (range.sharp - range.smooth) * sharpness,
    from: Math.min(a, b),
    to: Math.max(a, b),
    round: params.ends === 'round' ? 1 : 0,
    endSize: clamp(params.endSize / 100, 0, 1),
    curve: clamp(params.curve / 100, -1, 1),
    grooves: grooves ? 1 : 0,
  }
}

/**
 * One twist's radius scale m at the lathe's angle `phi` and height `v` (a share of the
 * solid's height from its top). Within the band, flutes cut in from the full radius by up to
 * `depth`, centered on the creases (t = π + 2πk), t = flutes·(φ − rotate + turn·f(band v)),
 * f bending the turn by `curve`: lobes (cut 1 − sin(x/2)^p: full radius on the lobes) or
 * grooves (cut cos(x/2)^p: narrow channels in flat ribs), x = distance from the crease.
 * At the band's ends the cuts fade in, or with round ends also narrow to a point along a
 * quarter ellipse, so each closes in an arch while the surface around stays at the full
 * radius (the silhouette carries on). At the trophy's very top or bottom that happens only
 * with an end size; at 0 the flutes run straight off the rim.
 * Mirrored by twistOne() in trophyMaterial.ts.
 */
export function twistScale(s: TwistShape, v: number, phi: number): number {
  // Outside the band (a band from the very top or to the very bottom includes the rim).
  if ((s.from > 0 && v <= s.from) || (s.to < 1 && v >= s.to) || s.depth <= 0) return 1
  // Distance to the nearest band end that has an end: inside the trophy always; at its very
  // top or bottom only with an end size (else the flutes run straight off the rim).
  const atRim = s.endSize <= 0
  const d = Math.min(
    s.from > 0 || !atRim ? v - s.from : Infinity,
    s.to < 1 || !atRim ? s.to - v : Infinity,
  )
  const vb = clamp((v - s.from) / Math.max(s.to - s.from, 1e-6), 0, 1)
  const t = s.flutes * (phi - s.rotate + s.turn * (vb - s.curve * (vb - vb * vb)))
  const end = Math.max(s.endSize, MIN_END)
  const fade = smoothstep(s.round ? end * ROUND_EDGE : end, d)
  // Round ends: each cut's half-width grows from 0 at the end along a quarter ellipse.
  const e = d / end
  const width = s.round && e < 1 ? Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e))) : 1
  // Distance from the crease (the cut's middle), 0…π, over the cut's width.
  const fromCrease = t - Math.PI
  const delta = Math.abs(fromCrease - 2 * Math.PI * Math.round(fromCrease / (2 * Math.PI)))
  const x = delta / Math.max(width, 1e-4)
  if (x >= Math.PI) return 1
  const cut = s.grooves ? Math.cos(x / 2) ** s.exponent : 1 - Math.sin(x / 2) ** s.exponent
  return 1 - s.depth * fade * cut
}

/**
 * Twist nodes' combined radius scale over a solid spanning `top` down to `top - height`
 * (y up): their scales multiply. Null for none. (The shader takes the slopes it needs for
 * normals itself, per pixel.)
 */
export function twistDeform(
  shapes: readonly TwistShape[],
  top: number,
  height: number,
): RadialScale | null {
  if (shapes.length === 0) return null
  const span = Math.max(height, 1e-6)
  return (phi, y) => {
    const v = (top - y) / span
    let m = 1
    for (const shape of shapes) m *= twistScale(shape, v, phi)
    return m
  }
}
