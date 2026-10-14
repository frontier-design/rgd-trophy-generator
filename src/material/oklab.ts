// Pure math only: no library imports allowed in material/ (enforced by ESLint).
// OKLab / OKLCH, a perceptual color space: equal steps look equally different, so ramps
// built in it read as smooth. Matrices from Björn Ottosson, https://bottosson.github.io/posts/oklab/
import { hexToRgb, type Rgb } from './palettes'

export interface Oklch {
  /** Lightness, 0 (black) – 1 (white). */
  l: number
  /** Chroma (colorfulness), 0 = gray; sRGB tops out around 0.32. */
  c: number
  /** Hue angle in degrees, 0–360. */
  h: number
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB (0–1) → OKLCH. */
export function rgbToOklch([r8, g8, b8]: Rgb): Oklch {
  const [r, g, b] = [toLinear(r8), toLinear(g8), toLinear(b8)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return { l: L, c: Math.hypot(A, B), h: (h + 360) % 360 }
}

/** OKLCH → sRGB (0–1). Not clamped: values outside 0–1 mean out of gamut. */
export function oklchToRgbUnclamped({ l: L, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const EPSILON = 1e-4
const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -EPSILON && v <= 1 + EPSILON)

/**
 * OKLCH → sRGB, keeping lightness and hue and reducing chroma just enough to fit sRGB
 * (binary search). This avoids the hue shifts that plain channel clipping causes.
 */
export function oklchToRgb(color: Oklch): Rgb {
  if (inGamut(oklchToRgbUnclamped(color))) return clampRgb(oklchToRgbUnclamped(color))
  let lo = 0
  let hi = color.c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToRgbUnclamped({ ...color, c: mid }))) lo = mid
    else hi = mid
  }
  return clampRgb(oklchToRgbUnclamped({ ...color, c: lo }))
}

export function hexToOklch(hex: string): Oklch {
  return rgbToOklch(hexToRgb(hex))
}

/** sRGB (0–1) → `#rrggbb`. */
export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function clampRgb([r, g, b]: Rgb): Rgb {
  const c = (v: number) => Math.min(1, Math.max(0, v))
  return [c(r), c(g), c(b)]
}
