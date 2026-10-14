// Three.js reference: https://threejs.org/docs/#LatheGeometry and node_modules/@types/three
import { MathUtils, Vector2 } from 'three'
import type { Outline2D } from '../types'

/** Points closer than this to the axis count as on it (px). */
const AXIS_EPSILON = 1e-6

/**
 * One lathe profile per contour that touches the axis (contours that don't are skipped).
 */
export function outlineToLatheProfiles(outline: Outline2D, axisX: number): Vector2[][] {
  return outline.contours
    .map((contour) => outlineToLatheProfile({ contours: [contour] }, axisX))
    .filter((profile) => profile.length >= 3)
}

/**
 * Turn a 2D outline's first contour into a lathe profile for revolving around the
 * vertical line x = axisX.
 *
 * Lathe space: x = distance from the axis (radius), y points up (screen y is flipped).
 * The profile starts at the lowest point on the axis, walks away from the axis around the
 * contour and ends at the next point on the axis. Going bottom → top makes
 * LatheGeometry's normals face outward.
 *
 * Returns [] if the outline doesn't touch the axis.
 * TODO: shapes that don't touch the axis (they'd revolve into a ring).
 */
export function outlineToLatheProfile(outline: Outline2D, axisX: number): Vector2[] {
  const contour = outline.contours[0]
  if (!contour || contour.length < 3) return []

  const pts = dedupe(contour.map((p) => new Vector2(Math.max(0, axisX - p.x), -p.y)))
  const n = pts.length
  const onAxis = (v: Vector2) => v.x < AXIS_EPSILON
  const at = (i: number) => pts[((i % n) + n) % n] as Vector2

  let start = -1
  pts.forEach((p, i) => {
    if (onAxis(p) && (start < 0 || p.y < at(start).y)) start = i
  })
  if (start < 0) return []

  // Walk away from the axis: skip the direction that runs along it.
  const step = onAxis(at(start + 1)) ? -1 : 1
  const profile = [at(start)]
  for (let k = 1; k < n; k++) {
    const p = at(start + step * k)
    profile.push(p)
    if (onAxis(p)) break
  }
  return profile
}

/** Direction changes sharper than this are corners; gentler ones are curves. */
const CORNER_ANGLE = MathUtils.degToRad(30)

/**
 * Duplicate every corner point. LatheGeometry averages the normals of the two segments
 * meeting at a point, which rounds off sharp steps; a zero-length segment in between
 * keeps each side's own normal, so steps stay crisp. Points on flattened curves (small
 * direction changes) are left alone so rounded steps still shade smoothly.
 */
export function withCrispCorners(profile: Vector2[]): Vector2[] {
  if (profile.length < 3) return profile
  const out = [profile[0] as Vector2]
  for (let i = 1; i < profile.length - 1; i++) {
    const prev = profile[i - 1] as Vector2
    const p = profile[i] as Vector2
    const next = profile[i + 1] as Vector2
    const a = p.clone().sub(prev)
    const b = next.clone().sub(p)
    const turn = Math.abs(Math.atan2(a.cross(b), a.dot(b)))
    out.push(p)
    if (turn > CORNER_ANGLE) out.push(p.clone())
  }
  out.push(profile.at(-1) as Vector2)
  return out
}

function dedupe(points: Vector2[]): Vector2[] {
  const out = points.filter((p, i) => i === 0 || !p.equals(points[i - 1] as Vector2))
  while (out.length > 1 && (out.at(-1) as Vector2).equals(out[0] as Vector2)) out.pop()
  return out
}

/**
 * Insert evenly spaced points into segments longer than `maxLength`, so per-vertex values
 * (like the ledge shadow) can vary smoothly along a long wall instead of only between its
 * ends. Inserted points are collinear, so they don't change the shape or its normals.
 */
export function subdivideProfile(profile: Vector2[], maxLength: number): Vector2[] {
  if (profile.length < 2 || !(maxLength > 0)) return profile
  const out = [profile[0] as Vector2]
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1] as Vector2
    const b = profile[i] as Vector2
    const pieces = Math.ceil(a.distanceTo(b) / maxLength)
    for (let k = 1; k < pieces; k++) out.push(a.clone().lerp(b, k / pieces))
    out.push(b)
  }
  return out
}
