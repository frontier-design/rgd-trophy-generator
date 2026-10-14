// Pure geometry (no Paper.js): fillets for the sharp corners where one line's box meets the
// next one's. Built into Paper paths by boxShape.ts.
import type { LineBox, Point2 } from '../types'

/** One fillet: an arc of `radius` around `center`, tangent to the narrower box's side at
 *  `start` and to the wider box's edge at `end`, replacing the sharp `corner`. */
export interface JoinFillet {
  corner: Point2
  start: Point2
  center: Point2
  end: Point2
  radius: number
}

/** Fillets smaller than this (px) aren't worth drawing. */
const MIN_RADIUS = 0.5

/**
 * Where two consecutive line boxes meet, the shape (to their right) has a sharp corner:
 * the narrower box's right side meets the wider box's facing edge (its top when it's below,
 * its bottom when above). That's a right angle when the boxes overlap past the narrower
 * box's corner radius, an acute corner on its rounded corner when they overlap less, and a
 * cusp when they just touch. This returns a fillet of up to `radius` for each, tangent to
 * both sides: to the straight side, or externally to the rounded corner.
 *
 * The radius is reduced as needed so the fillet ends on straight parts: before the wider
 * box's own corner curve, and on the narrower box's side before its far corner curve (or,
 * when the narrower box has a join at both ends, before the halfway point between them).
 * Boxes with a gap between them, or equally wide, have no such corner.
 */
export function joinFillets(boxes: LineBox[], radius: number): JoinFillet[] {
  if (!(radius > 0)) return []
  const fillets: JoinFillet[] = []
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i] as LineBox
    const b = boxes[i + 1] as LineBox
    if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) continue
    const aRight = a.x + a.width
    const bRight = b.x + b.width
    if (Math.abs(aRight - bRight) < 1e-6) continue
    // The narrower box and the wider one; dir = 1 when the wider is below (work as is),
    // -1 when above (work in a vertically flipped frame, y' = −y, then flip back).
    const [narrow, wide, dir] = aRight < bRight ? [a, b, 1] : [b, a, -1]
    // The narrower box's neighbor on its other side (above it when the wider box is below).
    const other = dir === 1 ? boxes[i - 1] : boxes[i + 2]
    const fillet = filletFor(narrow, wide, other, dir, radius)
    if (fillet) fillets.push(fillet)
  }
  return fillets
}

function filletFor(
  n: LineBox,
  w: LineBox,
  other: LineBox | undefined,
  dir: number,
  requested: number,
): JoinFillet | null {
  // In the (flipped) frame the wider box's facing edge is the line y = edge, and the
  // narrower box sits above it, reaching down to nBottom.
  const nTop = dir === 1 ? n.y : -(n.y + n.height)
  const nBottom = dir === 1 ? n.y + n.height : -n.y
  const edge = dir === 1 ? w.y : -(w.y + w.height)
  const overlap = nBottom - edge
  if (overlap < 0 || edge <= nTop) return null // a gap, or no corner on this side

  const nRight = n.x + n.width
  const wRight = w.x + w.width
  const rN = n.radius
  // Center of the narrower box's rounded corner nearest the edge.
  const arc = { x: nRight - rN, y: nBottom - rN }
  // The sharp corner: on the straight side if the edge is above the corner curve, else on it.
  const corner =
    overlap >= rN
      ? { x: nRight, y: edge }
      : { x: arc.x + Math.sqrt(Math.max(0, rN * rN - (edge - arc.y) ** 2)), y: edge }

  // The fillet circle of radius s sits above the edge (center.y = edge − s). It's tangent
  // to the straight side (center.x = nRight + s) once that touch point is above the corner
  // curve, otherwise externally tangent to the curve (|center − arc| = rN + s).
  const onStraight = (s: number) => s >= rN - overlap
  const centerFor = (s: number) =>
    onStraight(s)
      ? { x: nRight + s, y: edge - s }
      : {
          x: arc.x + Math.sqrt(Math.max(0, (rN + s) ** 2 - (edge - s - arc.y) ** 2)),
          y: edge - s,
        }
  // How far up the narrower box's side the fillet may reach: to where the side's straight
  // part starts, or, if the box has a join at its other end too, halfway to that join.
  let limit = nTop + rN
  if (other && other.width > 0 && other.x + other.width > nRight) {
    const otherEdge = dir === 1 ? other.y + other.height : -other.y
    if (otherEdge >= nTop && otherEdge < edge) limit = Math.max(limit, (otherEdge + edge) / 2)
  }
  // Stay on the wider box's straight edge and within that limit.
  const valid = (s: number) =>
    centerFor(s).x <= wRight - w.radius + 1e-9 && (!onStraight(s) || edge - s >= limit)

  let s = requested
  if (!valid(s)) {
    let lo = 0
    let hi = requested
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (valid(mid)) lo = mid
      else hi = mid
    }
    s = lo
  }
  if (s < MIN_RADIUS) return null

  const center = centerFor(s)
  const start = onStraight(s)
    ? { x: nRight, y: edge - s }
    : {
        x: arc.x + ((center.x - arc.x) * rN) / (rN + s),
        y: arc.y + ((center.y - arc.y) * rN) / (rN + s),
      }
  const end = { x: center.x, y: edge }
  const back = (p: Point2): Point2 => ({ x: p.x, y: dir * p.y })
  return {
    corner: back(corner),
    start: back(start),
    center: back(center),
    end: back(end),
    radius: s,
  }
}
