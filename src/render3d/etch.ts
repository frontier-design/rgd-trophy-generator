// Pure math for the etch node: bundles of fine lines on the solid, in several layouts. The
// shader (trophyMaterial.ts, etchAt) draws them, cut as grooves or inlaid; etchDistance
// mirrors its pattern so it can be unit tested (keep them in sync).
import type { EtchLayout, EtchParams } from '../types'
import { modifierRange } from './modifierRange'

/** At most this many etch nodes on one solid (the shader's uniform array size). */
export const MAX_ETCHES = 8
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
  return {
    ...modifierRange(params.from, params.to),
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

/** How much of the way around the header preview shows: the front half, as on the trophy. */
const PREVIEW_TURN = Math.PI

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * An etch node's lines for its card header (`width` × `height` px, row by row): each pixel's
 * coverage, 0…1. The header stands for the strip unrolled (top to bottom = from to to,
 * across = the front half of the way around), so it shows the layout, bundles, lines, gap,
 * slant, waves and cross; thickness is scaled to 1.25–5 CSS px; the depth eases from top to
 * bottom depth and fades at the edges, roughly as on the solid (an approximation: the shader's
 * stripDepth is the reference).
 */
export function etchPreview(
  params: EtchParams,
  width: number,
  height: number,
  /** Device px per CSS px, so lines keep their thickness on screen. */
  ratio = 1,
): Float32Array {
  const s = { ...etchShape(params), from: 0, to: 1 }
  const out = new Float32Array(width * height)
  if (width <= 0 || height <= 0) return out
  const half = (clamp(params.width * 0.4, 1.25, 5) * ratio) / 2
  // One bundle period, in px: around (lines down the strip) or across it (rings).
  const aroundPx = (width * (2 * Math.PI)) / PREVIEW_TURN / s.bundles
  const ringPx = height / s.bundles
  const directions: (1 | -1)[] = s.cross ? [1, -1] : [1]
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height
    const edge = s.fade > 0 ? smoothstep(0, s.fade, v) * smoothstep(0, s.fade, 1 - v) : 1
    const depth =
      (s.depthTop + (s.depthBottom - s.depthTop) * smoothstep(0, 1, v)) *
      edge *
      (0.6 + 0.4 * s.strength)
    if (depth <= 0) continue
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width) * PREVIEW_TURN
      let coverage = 0
      for (const direction of directions) {
        const rings = s.layout === ETCH_LAYOUTS.horizontal && direction === 1
        const d = etchDistance(s, phi, v, direction) * (rings ? ringPx : aroundPx)
        coverage = Math.max(coverage, clamp(half + 0.5 - d, 0, 1))
      }
      out[y * width + x] = coverage * depth
    }
  }
  return out
}
