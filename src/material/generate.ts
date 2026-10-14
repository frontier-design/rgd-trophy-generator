// Pure math only: no library imports allowed in material/ (enforced by ESLint).
import { hexToOklch, oklchToRgb, rgbToHex } from './oklab'
import { MAX_STOPS } from './palettes'

export interface GenerateOptions {
  /** How many colors (2 – MAX_STOPS). More stops = smoother. */
  stops?: number
  /** How much darker the top gets than the seed, in OKLCH lightness. */
  darkRange?: number
  /** How much lighter the bottom gets than the seed, in OKLCH lightness. */
  lightRange?: number
  /** Share (0–1) of the way the end hues turn toward the shadow/light hues. */
  hueShift?: number
}

/** Shadows lean toward blue-violet, lights toward warm yellow (OKLCH hue, degrees). */
const SHADOW_HUE = 280
const LIGHT_HUE = 95
/** Keep the ends off pure black/white so they still carry color. */
const LIGHTNESS_LIMITS = { min: 0.16, max: 0.94 }

/**
 * A gradient palette from one color, top (dark) → bottom (light), in OKLCH so steps are
 * perceptually even. The seed sits exactly where its own lightness falls in the ramp. Hue
 * turns gradually toward SHADOW_HUE in the darks and LIGHT_HUE in the lights (the painter's
 * hue shift; e.g. crimson → maroon-plum above, → orange-coral below). Chroma eases off
 * toward the ends and is reduced only as far as needed to stay inside sRGB.
 */
export function generatePalette(seedHex: string, options: GenerateOptions = {}): string[] {
  const { stops = MAX_STOPS, darkRange = 0.32, lightRange = 0.3, hueShift = 0.3 } = options
  const n = Math.min(MAX_STOPS, Math.max(2, Math.round(stops)))
  const seed = hexToOklch(seedHex)
  const top = Math.min(seed.l, Math.max(LIGHTNESS_LIMITS.min, seed.l - darkRange))
  const bottom = Math.max(seed.l, Math.min(LIGHTNESS_LIMITS.max, seed.l + lightRange))

  return Array.from({ length: n }, (_, i) => {
    const l = top + ((bottom - top) * i) / (n - 1)
    const darker = l < seed.l
    // 0 at the seed's lightness, 1 at the end of its side of the ramp.
    const span = darker ? seed.l - top : bottom - seed.l
    const k = span > 0 ? Math.abs(l - seed.l) / span : 0
    const h = seed.h + shortestArc(seed.h, darker ? SHADOW_HUE : LIGHT_HUE) * hueShift * k
    const c = seed.c * (1 - 0.25 * k)
    return rgbToHex(oklchToRgb({ l, c, h: (h + 360) % 360 }))
  })
}

/** Signed degrees to turn from `from` to `to` the short way round (−180 – 180). */
export function shortestArc(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}
