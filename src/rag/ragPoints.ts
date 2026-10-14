// Pure math only: no library imports allowed in rag/ (enforced by ESLint).
import type { LineMeasure, Point2, RagPoint } from '../types'

export type RagAlign = 'left' | 'right' | 'center'

export interface RagOptions {
  lineHeight: number
  columnWidth: number
  /** Which edge is flush; the opposite edge is the rag. */
  align: RagAlign
}

/**
 * Convert measured line widths into the vertices of the ragged edge, top to bottom.
 * For left-aligned text each line contributes two points, (width, top) and
 * (width, bottom), producing the stepped contour of the rag.
 *
 * TODO: 'right' (x = columnWidth - width) and 'center'.
 */
export function lineWidthsToRagPoints(lines: LineMeasure[], options: RagOptions): RagPoint[] {
  if (options.align !== 'left') {
    throw new Error(`lineWidthsToRagPoints: align '${options.align}' is not implemented yet`)
  }
  return lines.flatMap((line) => {
    const top = line.index * options.lineHeight
    const bottom = top + options.lineHeight
    return [
      { x: line.width, y: top, lineIndex: line.index },
      { x: line.width, y: bottom, lineIndex: line.index },
    ]
  })
}

/**
 * The text side of the rag: close the contour along the flush edge (x = 0).
 * Returns [] when there are no points.
 */
export function ragPointsToPolygon(points: RagPoint[], _options: RagOptions): Point2[] {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return []
  return [...points.map(toPoint2), { x: 0, y: last.y }, { x: 0, y: first.y }]
}

/**
 * The negative space beside the rag: close the contour along the column's far edge
 * (x = columnWidth), giving the shape between the line ends and the column edge.
 * Returns [] when there are no points.
 */
export function ragPointsToNegativeSpacePolygon(points: RagPoint[], options: RagOptions): Point2[] {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return []
  return [
    ...points.map(toPoint2),
    { x: options.columnWidth, y: last.y },
    { x: options.columnWidth, y: first.y },
  ]
}

function toPoint2({ x, y }: Point2): Point2 {
  return { x, y }
}
