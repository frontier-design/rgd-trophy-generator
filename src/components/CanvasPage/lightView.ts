// Geometry for the lighting node's light-angle view (pure: no React): an isometric view of
// the cylinder (the trophy) standing on a ground plane, the viewer in front, the key light a
// small cube on an orbit around it, raised by its height, casting a square beam whose
// footprint wraps around the cylinder. The ground is foreshortened by TILT.

export interface Point {
  x: number
  y: number
}

/** A point in the view's world (px): x right, y up, z toward the viewer, about the ground
 *  point under the cylinder's axis. */
export interface World {
  x: number
  y: number
  z: number
}

/** The ground plane's foreshortening: a circle on it is drawn this many times as tall as
 *  it is wide (an isometric-like view from slightly above). */
export const TILT = 0.42

/** Toward the viewer (front and above): the direction the projection flattens away. Faces
 *  turned toward it are the ones seen. */
const VIEWER = normalize({ x: 0, y: TILT, z: 1 })

/** A world point on the view (the ground point under the axis at `ground`). */
export function project(p: World, ground: Point): Point {
  return { x: ground.x + p.x, y: ground.y + p.z * TILT - p.y }
}

/** The light's place in the world: on its orbit (radius `orbit`, shrinking as it rises),
 *  `at` px up (the cylinder's middle) plus `lift` px per unit of sin(height). Angle 0 is in
 *  front (toward the viewer), positive turns it to the right. */
export function lightWorld(
  angleDeg: number,
  heightDeg: number,
  orbit: number,
  lift: number,
  at = 0,
): World {
  const a = (angleDeg * Math.PI) / 180
  const e = (heightDeg * Math.PI) / 180
  const r = orbit * Math.cos(e)
  return { x: Math.sin(a) * r, y: at + Math.sin(e) * lift, z: Math.cos(a) * r }
}

/** The light on the view, the point on the ground under it, and whether it's in front of
 *  the cylinder (drawn over it) or behind (under it). */
export function lightPoint(
  angleDeg: number,
  heightDeg: number,
  ground: Point,
  orbit: number,
  lift: number,
  at = 0,
): { light: Point; onGround: Point; front: boolean } {
  const world = lightWorld(angleDeg, heightDeg, orbit, lift, at)
  return {
    light: project(world, ground),
    onGround: project({ ...world, y: 0 }, ground),
    front: Math.cos((angleDeg * Math.PI) / 180) >= 0,
  }
}

/** The angle (degrees) a pointer points the light to: its place read on the ground plane
 *  about `ground` (undoing the foreshortening), clamped to [min, max] (the slider's range). */
export function angleAt(point: Point, ground: Point, min: number, max: number): number {
  const degrees = (Math.atan2(point.x - ground.x, (point.y - ground.y) / TILT) * 180) / Math.PI
  return Math.min(max, Math.max(min, Math.round(degrees)))
}

/** A face to draw: its outline on the view and whether it's turned toward the viewer. */
export interface Face {
  points: Point[]
  visible: boolean
}

/**
 * The lamp: a cube of half-size `half` at the light, turned so one face points at the
 * cylinder's axis (the beam leaves from it). Its six faces, each with whether it's seen.
 */
export function lampCube(light: World, half: number, ground: Point): Face[] {
  const f = normalize({ x: -light.x, y: 0, z: -light.z })
  const s = { x: f.z, y: 0, z: -f.x }
  const up = { x: 0, y: 1, z: 0 }
  const corner = (i: number, j: number, k: number) =>
    add(light, scale(f, i * half), scale(s, j * half), scale(up, k * half))
  const faces: [World, World[]][] = [
    [f, [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)]],
    [scale(f, -1), [corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)]],
    [s, [corner(-1, 1, -1), corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1)]],
    [scale(s, -1), [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)]],
    [up, [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)]],
    [scale(up, -1), [corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, -1, -1)]],
  ]
  return faces.map(([normal, corners]) => ({
    points: corners.map((p) => project(p, ground)),
    visible: dot(normal, VIEWER) > 1e-6,
  }))
}

/**
 * The light's beam, a spotlight: from the lamp's square front face (half-width `half`,
 * `start` px out from the light) it angles out toward `target` (the cylinder's axis at the
 * middle), reaching `spread` px each way up and down there (`spreadAcross` across), each of
 * its edges traced ray by ray onto the cylinder (radius `radius`), so its end wraps around
 * it (its side, or its top when the light is above; edge rays that would miss it are pulled
 * in until they meet it). Its four sides (each with whether it's seen) and its footprint.
 */
export function squareBeam(
  light: World,
  target: World,
  options: {
    half: number
    start: number
    radius: number
    /** The cylinder's height (it stands on the ground). */
    height: number
    spread: number
    spreadAcross?: number
    samples?: number
  },
  ground: Point,
): { sides: Face[]; footprint: Point[] } {
  const n = options.samples ?? 12
  const d = normalize(sub(target, light))
  const u = normalize(cross(d, { x: 0, y: 1, z: 0 }), { x: 1, y: 0, z: 0 })
  const v = cross(u, d)
  const origin = add(light, scale(d, options.start))
  const h = options.half
  const across = options.spreadAcross ?? options.spread
  // A ray from the face's point (a, b) toward its place at the target (k of the way out to
  // its full spread), and where it meets the cylinder (null: it misses).
  const ray = (a: number, b: number, k: number) => {
    const from = add(origin, scale(u, a), scale(v, b))
    const aim = add(target, scale(u, (a / h) * across * k), scale(v, (b / h) * options.spread * k))
    const dir = normalize(sub(aim, from))
    const t = cylinderHit(from, dir, options.radius, options.height)
    return { from, to: t === null ? null : add(from, scale(dir, t)) }
  }
  // Where the ray lands: at its full spread if that meets the cylinder, else pulled in toward
  // the beam's middle (bisected) until it just does, so the beam never runs past it.
  const hit = (a: number, b: number): { from: World; to: World } => {
    const full = ray(a, b, 1)
    if (full.to) return { from: full.from, to: full.to }
    let lo = 0
    let hi = 1
    let best = ray(a, b, 0)
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2
      const tried = ray(a, b, mid)
      if (tried.to) {
        lo = mid
        best = tried
      } else hi = mid
    }
    return { from: best.from, to: best.to ?? best.from }
  }
  // The square's four edges, corner to corner (counter-clockwise across the beam).
  const corners: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ]
  const sides: Face[] = []
  const footprint: Point[] = []
  corners.forEach(([a0, b0], i) => {
    const [a1, b1] = corners[(i + 1) % 4]!
    const edge = Array.from({ length: n + 1 }, (_, k) => {
      const t = k / n
      return hit(a0 + (a1 - a0) * t, b0 + (b1 - b0) * t)
    })
    footprint.push(...edge.slice(0, -1).map((p) => project(p.to, ground)))
    const first = edge[0]!
    const last = edge[n]!
    // The side's outward normal: across its two edge rays, away from the beam's axis.
    const normal = normalize(cross(sub(last.from, first.from), sub(first.to, first.from)))
    const middle = add(scale(u, (a0 + a1) / 2), scale(v, (b0 + b1) / 2))
    const outward = dot(normal, middle) >= 0 ? normal : scale(normal, -1)
    sides.push({
      points: [first.from, last.from, ...edge.map((p) => p.to).reverse()].map((p) =>
        project(p, ground),
      ),
      visible: dot(outward, VIEWER) > 1e-6,
    })
  })
  return { sides, footprint }
}

/**
 * How far along `d` from `p` the ray first meets the cylinder (radius `r`, from the ground up
 * to `height`): its side within that height, else its top. Null when it misses.
 */
function cylinderHit(p: World, d: World, r: number, height: number): number | null {
  const candidates: number[] = []
  const a = d.x * d.x + d.z * d.z
  if (a > 1e-9) {
    const b = 2 * (p.x * d.x + p.z * d.z)
    const c = p.x * p.x + p.z * p.z - r * r
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a)
      const y = p.y + d.y * t
      if (t > 0 && y >= 0 && y <= height) candidates.push(t)
    }
  }
  // The top cap, inside its rim.
  if (Math.abs(d.y) > 1e-9) {
    const top = (height - p.y) / d.y
    const x = p.x + d.x * top
    const z = p.z + d.z * top
    if (top > 0 && x * x + z * z <= r * r) candidates.push(top)
  }
  return candidates.length ? Math.min(...candidates) : null
}

function add(...points: World[]): World {
  return points.reduce((sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y, z: sum.z + p.z }), {
    x: 0,
    y: 0,
    z: 0,
  })
}

function sub(p: World, q: World): World {
  return { x: p.x - q.x, y: p.y - q.y, z: p.z - q.z }
}

function scale(p: World, k: number): World {
  return { x: p.x * k, y: p.y * k, z: p.z * k }
}

function dot(p: World, q: World): number {
  return p.x * q.x + p.y * q.y + p.z * q.z
}

function cross(p: World, q: World): World {
  return { x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x }
}

function normalize(p: World, fallback: World = { x: 0, y: 0, z: 1 }): World {
  const length = Math.hypot(p.x, p.y, p.z)
  return length < 1e-9 ? fallback : { x: p.x / length, y: p.y / length, z: p.z / length }
}
