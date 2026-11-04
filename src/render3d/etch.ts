// Pure math for the etch node: bundles of fine lines on the solid, in several layouts. The
// shader (trophyMaterial.ts, etchAt) draws them, cut as grooves or inlaid; etchDistance
// mirrors its pattern so it can be unit tested (keep them in sync).
import type { EtchLayout, EtchParams } from '../types'

/** At most this many etch nodes on one solid (the shader's uniform array size). */
export const MAX_ETCHES = 4
/** At most this many lines in a bundle (the shader's loop). */
export const MAX_ETCH_LINES = 8

/** The layouts as the shader's codes. */
export const ETCH_LAYOUTS: Record<EtchLayout, number> = {
  diagonal: 0,
  vertical: 1,
  horizontal: 2,
  zigzag: 3,
  wave: 4,
}

/** One etch node in the units the shader uses. */
export interface EtchShape {
  /** The strip, as shares of the height from the top (from ≤ to). */
  from: number
  to: number
  /** Bundles around (a whole number); horizontal: rings across the strip. */
  bundles: number
  /** Lines per bundle (1…MAX_ETCH_LINES). */
  lines: number
  /** Between a bundle's lines, a share of a bundle's period. */
  gap: number
  /** Line thickness, frame px. */
  width: number
  /** Turn over the strip (zigzag/wave: swing), radians. */
  slant: number
  /** 1 = both directions. */
  cross: number
  /** 0 cut grooves, +1 bright inlay, −1 dark inlay. */
  style: number
  /** 0…1. */
  strength: number
  /** ETCH_LAYOUTS code. */
  layout: number
  /** Zigzag/wave periods over the strip. */
  waves: number
  /** Share of the strip each edge fades over (0–0.5). */
  fade: number
  /** Depth at the strip's top and bottom (0–1, eased between). */
  depthTop: number
  depthBottom: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** An etch node's fields as EtchShape. */
export function etchShape(params: EtchParams): EtchShape {
  const a = clamp(params.from / 100, 0, 1)
  const b = clamp(params.to / 100, 0, 1)
  return {
    from: Math.min(a, b),
    to: Math.max(a, b),
    bundles: Math.max(1, Math.round(params.bundles)),
    lines: clamp(Math.round(params.lines), 1, MAX_ETCH_LINES),
    gap: clamp(params.gap / 100, 0, 1),
    width: Math.max(0, params.width),
    slant: (params.slant * Math.PI) / 180,
    cross: params.cross ? 1 : 0,
    style: params.style === 'bright' ? 1 : params.style === 'dark' ? -1 : 0,
    strength: clamp(params.strength / 100, 0, 1),
    layout: ETCH_LAYOUTS[params.layout] ?? 0,
    waves: Math.max(0.5, params.waves),
    fade: clamp(params.fade / 100, 0, 0.5),
    depthTop: clamp(params.depthTop / 100, 0, 1),
    depthBottom: clamp(params.depthBottom / 100, 0, 1),
  }
}

/**
 * How far around (radians) a line winding in `direction` (±1) has turned at the strip's
 * share `vb` (0 top … 1 bottom): diagonal, steadily by the slant; zigzag, out and back
 * `waves` times; wave, a sine `waves` times; vertical and horizontal, not at all.
 */
export function etchOffset(s: EtchShape, vb: number, direction: 1 | -1): number {
  switch (s.layout) {
    case ETCH_LAYOUTS.diagonal:
      return direction * s.slant * vb
    case ETCH_LAYOUTS.zigzag: {
      const x = vb * s.waves
      return direction * s.slant * (1 - 2 * Math.abs(x - Math.floor(x) - 0.5))
    }
    case ETCH_LAYOUTS.wave:
      return direction * s.slant * 0.5 * Math.sin(2 * Math.PI * s.waves * vb)
    default:
      return 0
  }
}

/** The nearest of a bundle's lines to period coordinate q: its distance (0…0.5 periods). */
function nearestLine(s: EtchShape, q: number): number {
  const f = q - Math.floor(q)
  let nearest = Infinity
  for (let k = 0; k < s.lines; k++) {
    const center = 0.5 + (k - (s.lines - 1) / 2) * s.gap
    const d = Math.abs(f - center)
    nearest = Math.min(nearest, d, 1 - d)
  }
  return nearest
}

/**
 * The distance (in bundle periods, 0…0.5) from the lathe's angle `phi` at height share `v`
 * to the nearest line of the set `direction` picks (±1: a line set and, with cross, its
 * counterpart), or Infinity outside the strip. Lines around (diagonal, vertical, zigzag,
 * wave) start at φ and turn by etchOffset down the strip, bundles repeating evenly around;
 * horizontal ones are rings, `bundles` of them across the strip (their counterpart: vertical
 * lines). Each bundle is `lines` lines `gap` apart, centered in its period.
 */
export function etchDistance(s: EtchShape, phi: number, v: number, direction: 1 | -1): number {
  if (v < s.from || v > s.to) return Infinity
  const vb = (v - s.from) / Math.max(s.to - s.from, 1e-6)
  if (s.layout === ETCH_LAYOUTS.horizontal && direction === 1) return nearestLine(s, vb * s.bundles)
  const turn = s.layout === ETCH_LAYOUTS.horizontal ? 0 : etchOffset(s, vb, direction)
  return nearestLine(s, ((phi - turn) * s.bundles) / (2 * Math.PI))
}
