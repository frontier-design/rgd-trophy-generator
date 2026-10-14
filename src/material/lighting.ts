// Pure math only: no library imports allowed in material/ (enforced by ESLint).
// The trophy shader's lit mode (render3d/trophyMaterial.ts) mirrors litLuminance; keep
// them in sync.
import type { MaterialSettings } from '../types'
import { gradientCoord, samplePalette, type GradientRampStop } from './gradient'
import type { PaletteStop } from './palettes'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type LightingSettings = Pick<
  MaterialSettings,
  | 'lightAngle'
  | 'lightHeight'
  | 'ambient'
  | 'softness'
  | 'highlight'
  | 'highlightSize'
  | 'edgeDepth'
>

/**
 * The key light's direction in view space (x right, y up, z toward the viewer), like
 * Illustrator's 3D light: `angleDeg` turns it around the subject (0 = from the front,
 * positive = from the right), `heightDeg` raises it (0 = level, 90 = straight above).
 */
export function lightDirection(angleDeg: number, heightDeg: number): Vec3 {
  const a = (angleDeg * Math.PI) / 180
  const e = (heightDeg * Math.PI) / 180
  return { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: Math.cos(a) * Math.cos(e) }
}

/**
 * The lit mode's grayscale lighting at a surface normal (view space), before shadows,
 * noise and the gradient map: ambient + wrapped diffuse (softness widens the lit side and
 * fades the terminator), darkened toward the silhouette by `edgeDepth`, plus a highlight
 * (`highlightSize` 0 = tight and sharp, 1 = broad and soft). 0 ≈ deepest shadow; values
 * above 1 are the hottest highlight (the gradient map clamps them to its lightest stop).
 */
export function litLuminance(
  normal: Vec3,
  look: LightingSettings,
  view: Vec3 = { x: 0, y: 0, z: 1 },
): number {
  const n = normalize(normal)
  const v = normalize(view)
  const l = lightDirection(look.lightAngle, look.lightHeight)
  const diffuse = clamp01((dot(n, l) + look.softness) / (1 + look.softness))
  const h = normalize({ x: l.x + v.x, y: l.y + v.y, z: l.z + v.z })
  const shininess = 200 + (6 - 200) * look.highlightSize
  const spec = Math.max(dot(n, h), 0) ** shininess * look.highlight
  const fresnel = (1 - clamp01(Math.abs(dot(n, v)))) ** 1.6
  const lit = look.ambient + (1 - look.ambient) * diffuse
  return lit * (1 - fresnel * look.edgeDepth * 0.5) + spec
}

/**
 * The lit look across the front of a revolved form, as linear-gradient stops for the 2D
 * sketch: a cylinder seen from the front, from its left silhouette (offset 0, normal
 * pointing left) through the middle (facing the viewer) to its right silhouette (offset 1),
 * lit by `litLuminance` and recolored through the palette as a gradient map.
 */
export function litFrontRamp(
  stops: PaletteStop[],
  look: LightingSettings & Pick<MaterialSettings, 'gradientOffset' | 'gradientScale' | 'banding'>,
  samples = 64,
): GradientRampStop[] {
  const n = Math.max(2, samples)
  return Array.from({ length: n }, (_, i) => {
    const offset = i / (n - 1)
    const nx = -1 + 2 * offset
    const lum = litLuminance({ x: nx, y: 0, z: Math.sqrt(Math.max(0, 1 - nx * nx)) }, look)
    const coord = gradientCoord(lum, look.gradientOffset, look.gradientScale)
    return { offset, color: samplePalette(stops, coord, look.banding) }
  })
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}
