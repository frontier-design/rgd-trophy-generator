// Pure math only: no library imports allowed in material/ (enforced by ESLint).
// The trophy shader (render3d/trophyMaterial.ts) mirrors bandCoord, gradientCoord,
// samplePalette and hueRotate in GLSL; keep them in sync.
import type { MaterialSettings, Point2 } from '../types'
import type { PaletteStop, Rgb } from './palettes'

/**
 * Map a height coordinate (0 = top, 1 = bottom) to a palette coordinate, applying the
 * gradient offset (positive moves the bands down) and scale (stretches the bands around
 * the middle; > 1 makes them wider). Not clamped.
 */
export function gradientCoord(t: number, offset: number, scale: number): number {
  return 0.5 + (t - 0.5 - offset) / Math.max(scale, 1e-3)
}

/**
 * Color at palette coordinate t (clamped to 0–1). `banding` picks how adjacent stops blend:
 * 1 = smoothstep (soft bands: the gradient eases in and out of each stop, like the
 * reference), 0 = linear (no pause at stops: seamless with dense stops). Same
 * sequential-mix algorithm as the shader.
 */
export function samplePalette(stops: PaletteStop[], t: number, banding = 1): Rgb {
  const first = stops[0]
  if (!first) return [0, 0, 0]
  const x = Math.min(1, Math.max(0, t))
  let color: Rgb = first.color
  for (let i = 1; i < stops.length; i++) {
    const a = (stops[i - 1] as PaletteStop).position
    const { position: b, color: next } = stops[i] as PaletteStop
    const u = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-5)))
    const eased = u * u * (3 - 2 * u)
    color = mix(color, next, u + (eased - u) * banding)
  }
  return color
}

/**
 * The band coordinate before offset/scale: height down from the top (0 = top, 1 = bottom)
 * plus `tilt` × the horizontal distance from the revolve axis, both in units of the
 * shape's height. Constant-color lines are then straight diagonals with slope `tilt`
 * (positive rises to the right). Same formula in the shader.
 */
export function bandCoord(
  depthFromTop: number,
  xFromAxis: number,
  height: number,
  tilt: number,
): number {
  const h = Math.max(height, 1e-5)
  return depthFromTop / h + (tilt * xFromAxis) / h
}

/**
 * The band-coordinate range over which the color changes. Outside it, `gradientCoord`
 * falls outside 0–1 and the color is a constant end stop, so a linear gradient over just
 * this span (padded at its ends) reproduces the shader exactly.
 */
export function gradientSpan(
  look: Pick<MaterialSettings, 'gradientOffset' | 'gradientScale'>,
): [number, number] {
  const half = Math.max(look.gradientScale, 1e-3) / 2
  return [0.5 + look.gradientOffset - half, 0.5 + look.gradientOffset + half]
}

export interface GradientRampStop {
  /** 0 = start of the gradient span, 1 = its end. */
  offset: number
  color: Rgb
}

/**
 * The material's gradient across its span as plain linear-gradient stops, for 2D
 * renderers (the Paper.js shape; pair with `tiltedGradientLine`). Sampled densely so linear
 * interpolation between stops matches the shader's smoothstep blend. No wobble, edge,
 * ledge or grain: those are 3D.
 */
export function gradientRamp(
  stops: PaletteStop[],
  look: Pick<MaterialSettings, 'gradientOffset' | 'gradientScale' | 'banding'>,
  samples = 64,
): GradientRampStop[] {
  const n = Math.max(2, samples)
  const [from, to] = gradientSpan(look)
  return Array.from({ length: n }, (_, i) => {
    const offset = i / (n - 1)
    const band = from + (to - from) * offset
    const coord = gradientCoord(band, look.gradientOffset, look.gradientScale)
    return { offset, color: samplePalette(stops, coord, look.banding) }
  })
}

/**
 * Start and end points (y down) of the 2D linear gradient that reproduces `bandCoord` over
 * `gradientSpan`: a gradient along direction (tilt, 1), anchored at the axis on the shape's
 * top edge. A point's position along this line, 0 at `from` and 1 at `to`, is exactly the
 * ramp offset of its band coordinate.
 */
export function tiltedGradientLine(
  shape: { top: number; height: number },
  axisX: number,
  tilt: number,
  span: [number, number],
): { from: Point2; to: Point2 } {
  const k = Math.max(shape.height, 1e-5) / (1 + tilt * tilt)
  const at = (band: number) => ({ x: axisX + tilt * k * band, y: shape.top + k * band })
  return { from: at(span[0]), to: at(span[1]) }
}

/**
 * Rotate an sRGB color's hue by `degrees` (positive: red → yellow → green), keeping its
 * lightness roughly (rotation about the gray axis). Results are clamped to 0–1. Same
 * formula as the shader's edge hue shift.
 */
export function hueRotate(color: Rgb, degrees: number): Rgb {
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const k = 1 / Math.sqrt(3)
  const [r, g, b] = color
  const gray = ((r + g + b) / 3) * (1 - cos)
  // c·cos + (k × c)·sin + k·(k·c)·(1 − cos), with k = (1,1,1)/√3.
  return [
    clamp01(r * cos + k * (b - g) * sin + gray),
    clamp01(g * cos + k * (r - b) * sin + gray),
    clamp01(b * cos + k * (g - r) * sin + gray),
  ]
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
