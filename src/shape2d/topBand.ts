// Pure geometry (no Paper.js) for the top band: a trapezoid when tapered, with an optional
// fillet at its bottom-left corner. Built into a Paper path by boxShape.ts.
import type { LineBox, Point2, ShapeExtent } from '../types'

export interface TopBandOptions {
  /** The right edge (revolve axis). */
  edgeX: number
  /** 0–1: how much narrower the band's top is than its bottom (0 = straight sides). On the
   *  trophy that's the top circle's radius shrinking: 0.5 = half the bottom's radius. */
  taper: number
  /** Requested fillet radius for the bottom-left corner (0 = sharp). */
  cornerRadius: number
}

export interface TopBand {
  /** Top-left, top-right, bottom-right corners (y down). */
  topLeft: Point2
  topRight: Point2
  bottomRight: Point2
  /** The bottom-left corner, sharp... */
  bottomLeft: Point2
  /** ...or rounded: start on the bottom edge, a point mid-arc, end on the slanted side. */
  fillet: { start: Point2; through: Point2; end: Point2; radius: number } | null
}

/**
 * The top band's outline, or null when there's no band (top band height 0).
 *
 * The bottom edge runs from the text's left side to the edge; its visible part (above the
 * first line's box) is where a fillet can sit, so the fillet is capped by that run, and by
 * the slanted side's length. For a corner angle θ, a fillet of radius r touches each edge
 * at r / tan(θ/2) from the corner.
 */
export function topBandGeometry(
  boxes: LineBox[],
  extent: ShapeExtent,
  { edgeX, taper, cornerRadius }: TopBandOptions,
): TopBand | null {
  if (boxes.length === 0) return null
  const bandBottom = Math.min(...boxes.map((b) => b.y))
  const { left, top } = extent
  if (!(bandBottom > top) || !(edgeX > left)) return null

  const t = Math.min(0.99, Math.max(0, taper))
  const topLeft = { x: left + t * (edgeX - left), y: top }
  const bottomLeft = { x: left, y: bandBottom }
  const band = {
    topLeft,
    topRight: { x: edgeX, y: top },
    bottomRight: { x: edgeX, y: bandBottom },
    bottomLeft,
  }

  // Corner at bottomLeft between the bottom edge (pointing right) and the side (pointing
  // up toward topLeft).
  const side = { x: topLeft.x - left, y: top - bandBottom }
  const sideLength = Math.hypot(side.x, side.y)
  const u1 = { x: 1, y: 0 }
  const u2 = { x: side.x / sideLength, y: side.y / sideLength }
  const angle = Math.acos(Math.min(1, Math.max(-1, u1.x * u2.x + u1.y * u2.y)))
  const half = angle / 2

  const run = bottomRun(boxes, bandBottom, left)
  const maxRadius = Math.min(run, sideLength) * Math.tan(half)
  const radius = Math.max(0, Math.min(cornerRadius, maxRadius))
  if (!(radius > 0.01)) return { ...band, fillet: null }

  const tangent = radius / Math.tan(half)
  const bisector = normalize({ x: u1.x + u2.x, y: u1.y + u2.y })
  const center = {
    x: left + (bisector.x * radius) / Math.sin(half),
    y: bandBottom + (bisector.y * radius) / Math.sin(half),
  }
  return {
    ...band,
    fillet: {
      start: { x: left + u1.x * tangent, y: bandBottom + u1.y * tangent },
      through: { x: center.x - bisector.x * radius, y: center.y - bisector.y * radius },
      end: { x: left + u2.x * tangent, y: bandBottom + u2.y * tangent },
      radius,
    },
  }
}

/**
 * Length of the band's visible bottom edge: from the text's left side to where the first
 * line's box (right under the band) starts curving. 0 if no box sits there.
 */
function bottomRun(boxes: LineBox[], bandBottom: number, left: number): number {
  const under = boxes.filter(
    (b) => b.y === bandBottom && b.width > 0 && b.height > 0 && b.x <= left,
  )
  return Math.max(0, ...under.map((b) => b.x + b.width - b.radius - left))
}

function normalize(v: Point2): Point2 {
  const length = Math.hypot(v.x, v.y) || 1
  return { x: v.x / length, y: v.y / length }
}
