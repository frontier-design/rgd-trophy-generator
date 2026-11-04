// Paper.js reference: http://paperjs.org/reference/pathitem/#subtract-path
// `paper.*` types come from the global `paper` namespace declared in paper/dist/paper.d.ts.
import type { LineBox, Point2, ShapeExtent } from '../types'
import { joinFillets, type JoinFillet } from './joinFillets'
import { topBandGeometry, type TopBand } from './topBand'

export interface BoxShapeOptions {
  /** The right edge (revolve axis). */
  edgeX: number
  /** The region the shape fills before the boxes carve it (rag/shapeExtent): from the
   *  text's left side, from the top band down to the last line's baseline. */
  extent: ShapeExtent
  /** Rounds the top band's bottom-left corner (on the trophy: the top section's bottom
   *  rim). 0 = square. Capped by the band's visible bottom edge and its side. */
  topCornerRadius?: number
  /** 0–1: narrows the band's top (on the trophy: the top circle), see topBandGeometry. */
  taper?: number
  /** Fillet radius for the sharp corners where consecutive lines' boxes meet (see
   *  joinFillets); 0 = sharp. */
  joinRadius?: number
}

/**
 * The rag shape decided by the line boxes: the area between the boxes and the right
 * edge (x = edgeX), within `extent`. Rows no box covers (the top band, gaps from negative
 * vertical padding) span the full width, from the text's left side to the edge.
 *
 * Built with Paper.js booleans: start from the region's rectangle and subtract each box.
 * Each box is first extended far to the left, so only its right side (and its rounded
 * right corners) carves the shape. Rows that no box covers (e.g. gaps from negative
 * vertical padding) stay filled all the way across.
 *
 * Returns an item that is not inserted into the project, or null when there's nothing to
 * draw. The result may be a CompoundPath when boxes reach past the edge and split it.
 */
export function ragShapeFromBoxes(
  scope: paper.PaperScope,
  boxes: LineBox[],
  { edgeX, extent, topCornerRadius = 0, taper = 0, joinRadius = 0 }: BoxShapeOptions,
): paper.PathItem | null {
  scope.activate()

  const { left, top, bottom } = extent
  if (edgeX <= left || bottom <= top) return null

  // The region below the top band (from the first box down), joined with the top band
  // (no words, so full width; built on its own so it can taper and take a fillet at any
  // corner angle). Joined before carving: the two only share a straight edge then, which
  // keeps Paper's boolean ops robust (carving first can leave the shared edge ending
  // exactly on a box's curve, where union fails).
  // With no boxes (nothing typed in yet) and no band bottom given, it's all one block.
  const firstBoxTop = boxes.length > 0 ? Math.min(...boxes.map((b) => b.y)) : top
  const bandBottom = Math.min(bottom, Math.max(top, extent.bandBottom ?? firstBoxTop))
  let shape: paper.PathItem = new scope.Path.Rectangle({
    rectangle: new scope.Rectangle(left, bandBottom, edgeX - left, bottom - bandBottom),
    insert: false,
  })
  const band = topBandGeometry(boxes, extent, {
    edgeX,
    taper,
    cornerRadius: topCornerRadius,
  })
  if (band) shape = uniteAndDispose(shape, bandPath(scope, band))

  for (const box of boxes) {
    if (box.width <= 0 || box.height <= 0) continue
    // Push the left side (and its rounded corners) fully outside the region.
    const cutLeft = left - box.radius - 1
    const cutter = new scope.Path.Rectangle({
      rectangle: new scope.Rectangle(cutLeft, box.y, box.x + box.width - cutLeft, box.height),
      radius: box.radius,
      insert: false,
    })
    shape = subtractAndDispose(shape, cutter)
  }

  // Smooth the corners where consecutive lines' boxes meet: subtract each corner's notch
  // (the corner region outside its fillet circle).
  for (const fillet of joinFillets(boxes, joinRadius)) {
    shape = subtractAndDispose(shape, filletNotch(scope, fillet))
  }

  return shape.isEmpty() ? null : shape
}

/**
 * The region a fillet removes: the quadrilateral corner → start → center → end, minus the
 * fillet's disc. The corner is pushed 1px further out (into the boxes, which the shape
 * doesn't cover anyway) so the notch never shares an edge exactly with the shape, which
 * keeps Paper's boolean ops robust.
 */
function filletNotch(scope: paper.PaperScope, fillet: JoinFillet): paper.PathItem {
  const { corner, start, center, end, radius } = fillet
  const away = { x: corner.x - center.x, y: corner.y - center.y }
  const length = Math.hypot(away.x, away.y) || 1
  const outer = { x: corner.x + away.x / length, y: corner.y + away.y / length }
  const quad = new scope.Path({
    segments: [outer, start, center, end].map((p) => new scope.Point(p.x, p.y)),
    closed: true,
    insert: false,
  })
  const disc = new scope.Path.Circle({
    center: new scope.Point(center.x, center.y),
    radius,
    insert: false,
  })
  return subtractAndDispose(quad, disc)
}

/**
 * The radius the top band's bottom-left corner can actually take (see topBandGeometry):
 * 0 without a band; capped by the band's visible bottom edge and its side.
 */
export function topCornerRadiusFor(
  boxes: LineBox[],
  extent: ShapeExtent,
  requested: number,
  { edgeX = extent.left + 1e6, taper = 0 }: { edgeX?: number; taper?: number } = {},
): number {
  const band = topBandGeometry(boxes, extent, { edgeX, taper, cornerRadius: requested })
  return band?.fillet?.radius ?? 0
}

function bandPath(scope: paper.PaperScope, band: TopBand): paper.Path {
  const path = new scope.Path({ insert: false })
  const at = (p: Point2) => new scope.Point(p.x, p.y)
  path.moveTo(at(band.topLeft))
  path.lineTo(at(band.topRight))
  path.lineTo(at(band.bottomRight))
  if (band.fillet) {
    path.lineTo(at(band.fillet.start))
    path.arcTo(at(band.fillet.through), at(band.fillet.end))
  } else {
    path.lineTo(at(band.bottomLeft))
  }
  path.closePath()
  return path
}

/** `a ∪ b`, removing both inputs (they are never inserted, so this only frees them). */
function uniteAndDispose(a: paper.PathItem, b: paper.PathItem): paper.PathItem {
  const result = a.unite(b, { insert: false })
  a.remove()
  b.remove()
  return result
}

/** `a − b`, removing both inputs (they are never inserted, so this only frees them). */
function subtractAndDispose(a: paper.PathItem, b: paper.PathItem): paper.PathItem {
  const result = a.subtract(b, { insert: false })
  a.remove()
  b.remove()
  return result
}
