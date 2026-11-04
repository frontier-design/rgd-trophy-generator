// The pattern node's height map on the solid: settings in the shader's units (the map itself
// is built in pattern/, and uploaded as a texture by trophyMaterial.ts).
import type { PatternParams } from '../types'

/** At most this many pattern nodes on one solid (one texture each in the shader). */
export const MAX_PATTERNS = 2

/** A height map: `width × height` values 0–255 (255 = ornament), seamless across. */
export interface HeightMap {
  data: Uint8Array
  width: number
  height: number
}

/** A pattern on the solid: its map and how it's laid on (from the node's fields). */
export interface SolidPattern {
  map: HeightMap
  params: PatternParams
}

/** The style as the shader's code: 0 raised, 1 cut, 2 bright inlay, 3 dark inlay. */
export const PATTERN_STYLES = { raised: 0, cut: 1, bright: 2, dark: 3 } as const

/** A pattern's placement in the shader's units: the strip as shares of the height (from ≤
 *  to), repeats around (at its scale), style code, strength 0–1, edge fade (share of the
 *  strip), depth at its top and bottom, scale, each motif's scale in its cell. */
export function patternPlacement(params: PatternParams) {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1)
  const scale = Math.min(Math.max(params.scale / 100, 0.05), 20)
  const a = clamp(params.from / 100)
  const b = clamp(params.to / 100)
  return {
    from: Math.min(a, b),
    to: Math.max(a, b),
    // Whole repeats around, so the ornament meets itself seamlessly at any scale.
    repeats: Math.max(1, Math.round(params.repeats / scale)),
    /** The ornament's size against the strip (1 = it fills the strip's height). */
    scale,
    /** 1 = following the surface (proportions kept, rows), 0 = stretched over the strip. */
    surface: params.mapping === 'surface' ? 1 : 0,
    /** Each motif's size in its own cell (1 = it fills it). */
    shapeScale: Math.min(Math.max(params.shapeScale / 100, 0.05), 4),
    style: PATTERN_STYLES[params.style],
    strength: clamp(params.strength / 100),
    /** Share of the strip each edge fades over (0–0.5). */
    fade: Math.min(Math.max(params.fade / 100, 0), 0.5),
    /** The embossing's depth at the strip's top and bottom (0–1, eased between). */
    depthTop: clamp(params.depthTop / 100),
    depthBottom: clamp(params.depthBottom / 100),
  }
}
