import { BufferAttribute, BufferGeometry } from 'three'
import type { RadialScale } from './twist'

/** A profile point: x = distance from the axis, y = height. */
export interface LathePoint {
  x: number
  y: number
}

/**
 * The same geometry as Three's `LatheGeometry(points, segments, phiStart, phiLength)`
 * (positions, normals, uvs, index, in the same order), plus a per-vertex `aLedge`
 * attribute (one value per profile point, repeated around), built straight into typed
 * arrays. LatheGeometry allocates a JS array entry per number and is ~10× slower, which
 * matters when the solid is rebuilt every frame of an animation (a full-frame trophy is
 * ~250k vertices).
 *
 * With `deform` (twist nodes), each vertex's radius is scaled by m(φ, y). Its normal stays
 * the undeformed one: the shader computes the deformed surface's exact normal per pixel
 * (crisp creases wherever they cross the mesh) from `aProfileNormal`, the undeformed profile
 * normal, which deformed lathes also get. (Exact per-vertex normals took three evaluations
 * of m per vertex: most of a rebuild's time, for nothing the shader didn't redo.)
 */
export function buildLathe(
  points: readonly LathePoint[],
  ledge: readonly number[],
  segments: number,
  phiStart: number,
  phiLength: number,
  deform: RadialScale | null = null,
  /** Per profile point, the surface coordinate (surfaceCoordinates): repeated around as
   *  `aSurface`, for patterns that follow the surface. */
  surface: readonly number[] | null = null,
): BufferGeometry {
  const steps = Math.floor(segments)
  const length = Math.min(Math.max(phiLength, 0), Math.PI * 2)
  const count = points.length
  const geometry = new BufferGeometry()
  if (count < 2 || steps < 1) return geometry

  // Each point's normal on the first meridian, as LatheGeometry computes it: the sum of
  // the (unnormalized) normals of the segments either side, normalized.
  const initX = new Float32Array(count)
  const initY = new Float32Array(count)
  let prevX = 0
  let prevY = 0
  for (let j = 0; j < count; j++) {
    const a = points[j] as LathePoint
    if (j === count - 1) {
      // The last point takes the previous segment's (unnormalized) normal.
      initX[j] = prevX
      initY[j] = prevY
      continue
    }
    const b = points[j + 1] as LathePoint
    const curX = b.y - a.y
    const curY = -(b.x - a.x)
    const nx = j === 0 ? curX : curX + prevX
    const ny = j === 0 ? curY : curY + prevY
    const norm = Math.hypot(nx, ny) || 1
    initX[j] = nx / norm
    initY[j] = ny / norm
    prevX = curX
    prevY = curY
  }

  const vertexCount = (steps + 1) * count
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const ledges = new Float32Array(vertexCount)
  const surfaces = surface ? new Float32Array(vertexCount) : null
  const profileNormals = deform ? new Float32Array(vertexCount * 2) : null
  for (let i = 0; i <= steps; i++) {
    const phi = phiStart + (i / steps) * length
    const sin = Math.sin(phi)
    const cos = Math.cos(phi)
    const u = i / steps
    for (let j = 0; j < count; j++) {
      const p = points[j] as LathePoint
      const v = i * count + j
      const nx = initX[j] as number
      const ny = initY[j] as number
      if (deform) {
        if (profileNormals) {
          profileNormals[2 * v] = nx
          profileNormals[2 * v + 1] = ny
        }
        const r = p.x * deform(phi, p.y)
        positions[3 * v] = r * sin
        positions[3 * v + 1] = p.y
        positions[3 * v + 2] = r * cos
        normals[3 * v] = nx * sin
        normals[3 * v + 1] = ny
        normals[3 * v + 2] = nx * cos
      } else {
        positions[3 * v] = p.x * sin
        positions[3 * v + 1] = p.y
        positions[3 * v + 2] = p.x * cos
        normals[3 * v] = nx * sin
        normals[3 * v + 1] = ny
        normals[3 * v + 2] = nx * cos
      }
      uvs[2 * v] = u
      uvs[2 * v + 1] = j / (count - 1)
      ledges[v] = ledge[j] ?? 0
      if (surfaces) surfaces[v] = surface?.[j] ?? 0
    }
  }

  const index =
    vertexCount > 65535
      ? new Uint32Array(steps * (count - 1) * 6)
      : new Uint16Array(steps * (count - 1) * 6)
  let k = 0
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < count - 1; j++) {
      const a = j + i * count
      const b = a + count
      const c = a + count + 1
      const d = a + 1
      index[k++] = a
      index[k++] = b
      index[k++] = d
      index[k++] = c
      index[k++] = d
      index[k++] = b
    }
  }

  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('aLedge', new BufferAttribute(ledges, 1))
  if (surfaces) geometry.setAttribute('aSurface', new BufferAttribute(surfaces, 1))
  if (profileNormals)
    geometry.setAttribute('aProfileNormal', new BufferAttribute(profileNormals, 2))
  return geometry
}

/**
 * Each profile point's surface coordinate: how far down the solid it is, measured against
 * the solid's radius there (the integral of −dy / r, from 0 at the profile's top). Laid over
 * the solid with the angle around (both in the same units: radians), an ornament keeps its
 * proportions everywhere: where the solid narrows, it gets smaller rather than stretched.
 * Only height counts (flat ledges add nothing), so it rises steadily down the walls. Radii
 * under `minRadius` count as it, so it stays finite near the axis.
 */
export function surfaceCoordinates(points: readonly LathePoint[], minRadius = 1): number[] {
  const out = new Array<number>(points.length).fill(0)
  for (let j = 1; j < points.length; j++) {
    const a = points[j - 1] as LathePoint
    const b = points[j] as LathePoint
    const r = Math.max((a.x + b.x) / 2, minRadius)
    out[j] = (out[j - 1] ?? 0) + (a.y - b.y) / r
  }
  // Zero at the profile's top, whichever way it runs.
  let top = 0
  points.forEach((p, j) => {
    if (p.y > (points[top] as LathePoint).y) top = j
  })
  const offset = out[top] ?? 0
  return out.map((v) => v - offset)
}

/** The surface coordinate at height `y` on a profile (where its wall first reaches that
 *  height from the top), for lining a pattern up with its strip. */
export function surfaceAtHeight(
  points: readonly LathePoint[],
  surface: readonly number[],
  y: number,
): number {
  let best: number | null = null
  let bestY = -Infinity
  for (let j = 1; j < points.length; j++) {
    const a = points[j - 1] as LathePoint
    const b = points[j] as LathePoint
    const lo = Math.min(a.y, b.y)
    const hi = Math.max(a.y, b.y)
    if (y < lo || y > hi || hi === lo) continue
    // The highest crossing (the outer wall's, from the top).
    if (hi <= bestY) continue
    const t = (y - a.y) / (b.y - a.y)
    best = (surface[j - 1] ?? 0) + t * ((surface[j] ?? 0) - (surface[j - 1] ?? 0))
    bestY = hi
  }
  return best ?? 0
}
