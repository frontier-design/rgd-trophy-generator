// Paper.js reference: http://paperjs.org/reference/ and node_modules/paper/dist/paper.d.ts
// `paper.*` types come from the global `paper` namespace declared in paper/dist/paper.d.ts.
import type { Outline2D, Point2 } from '../types'

/**
 * Build a closed Paper.js path from a polygon, inside the given scope.
 * Items are created through `scope` (never the global `paper` object), and the scope is
 * activated first because Paper inserts new items into the *active* scope's project.
 * Returns null for fewer than 3 points.
 *
 * TODO: later: smoothing / rounding of the rag corners, offsets, boolean ops.
 */
export function ragPolygonToPath(scope: paper.PaperScope, polygon: Point2[]): paper.Path | null {
  if (polygon.length < 3) return null
  scope.activate()
  const path = new scope.Path(polygon.map((p) => new scope.Segment(new scope.Point(p.x, p.y))))
  path.closed = true
  return path
}

/**
 * Maximum distance (px) between a curve and the line segments that replace it when
 * flattening for the 3D stage. Small enough that rounded corners revolve into smooth rims
 * with no visible facets: a 40px radius gets ~16 segments per quarter circle (0.5 gave ~5).
 */
export const OUTLINE_FLATNESS = 0.05

/**
 * Flatten a Paper.js path (curves → line segments) into library-neutral contours so
 * render3d/ never depends on Paper.js.
 *
 * A CompoundPath yields one contour per child (outer first, then holes).
 * The input path is not modified.
 */
export function pathToOutline(path: paper.PathItem, flatness = OUTLINE_FLATNESS): Outline2D {
  const flat = path.clone({ insert: false })
  flat.flatten(flatness)
  const paths = (flat.className === 'CompoundPath' ? flat.children : [flat]) as paper.Path[]
  const contours = paths.map((p) => p.segments.map(({ point }) => ({ x: point.x, y: point.y })))
  flat.remove()
  return { contours }
}
