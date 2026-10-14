// Pure data + math only: no library imports allowed in material/ (enforced by ESLint).
import type { MaterialSettings, PaletteName } from '../types'

/** sRGB color, components 0–1. */
export type Rgb = readonly [number, number, number]

export interface PaletteStop {
  /** 0 = top of the shape, 1 = bottom. */
  position: number
  color: Rgb
}

/**
 * Gradient presets, colors listed top → bottom. Picked from the reference
 * (docs/reference/material-ref.png).
 */
export const PALETTES: Record<PaletteName, readonly string[]> = {
  // The RGD trophy reference, as a gradient map from shadow to highlight: deep forest
  // green → olive gray → mauve gray → steel blue → blue gray → sage → cream → white.
  studio: ['#1b261d', '#3c463b', '#7b7479', '#7c8fa0', '#a3b0b6', '#c3c6ac', '#ecead8', '#ffffff'],
  // The tall red vessel: maroon → crimson → orange → coral.
  ember: ['#6e1420', '#b8262a', '#ee5530', '#f2875e'],
  // The center vessel and the small bottle: lavender → pink → hot pink → orange.
  candy: ['#a9a6f2', '#dc8fdb', '#f2547f', '#f0562c'],
  // The blue hourglass, fading to warm gray at its foot.
  cobalt: ['#0b23c9', '#1840d8', '#6f7fd0', '#c7c1bd'],
  // The green stack: deep forest → lime.
  forest: ['#0f3a17', '#2c6a2a', '#7fb24a', '#a6cc5e'],
  // The plum stack: deep plum → magenta → orchid.
  plum: ['#2c0319', '#5e0b43', '#b23fa6', '#f08be8'],
  // The sphere and the tall flask.
  mustard: ['#cf9632', '#bb762a', '#a5602a'],
}

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[]

/** Most gradient stops a palette can have (the shader's uniform array size). */
export const MAX_STOPS = 8
/** Fewest colors a custom palette can have. */
export const MIN_CUSTOM_COLORS = 2

/** Parse `#rrggbb` (or `#rgb`) into sRGB components 0–1. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Invalid hex color: ${hex}`)
  const n = parseInt(full, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Colors as stops, evenly spaced from top (0) to bottom (1). At most MAX_STOPS. */
export function stopsFromColors(colors: readonly string[]): PaletteStop[] {
  const used = colors.slice(0, MAX_STOPS)
  return used.map((hex, i) => ({
    position: used.length === 1 ? 0 : i / (used.length - 1),
    color: hexToRgb(hex),
  }))
}

/** A preset's stops. */
export function paletteStops(name: PaletteName): PaletteStop[] {
  return stopsFromColors(PALETTES[name])
}

/** The colors the material currently uses: the preset's, or the custom ones (falling back
 *  to the first preset if the custom list is empty). */
export function paletteColors(
  look: Pick<MaterialSettings, 'palette' | 'customColors'>,
): readonly string[] {
  if (look.palette !== 'custom') return PALETTES[look.palette]
  return look.customColors.length > 0 ? look.customColors : PALETTES.ember
}

/** The material's gradient stops (preset or custom). */
export function materialStops(
  look: Pick<MaterialSettings, 'palette' | 'customColors'>,
): PaletteStop[] {
  return stopsFromColors(paletteColors(look))
}
