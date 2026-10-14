// Pure math only: no library imports allowed in rag/ (enforced by ESLint).
import type { FontMetrics, LineBox, LineMeasure, ShapeExtent } from '../types'

/**
 * A line's baseline, in px from the top of the text block. CSS centers the font's content
 * area (ascent + descent) in each line box and splits the leftover leading evenly, so the
 * baseline sits half the leading plus the ascent below the line's top.
 */
export function lineBaseline(lineIndex: number, lineHeight: number, metrics: FontMetrics): number {
  const halfLeading = (lineHeight - (metrics.ascent + metrics.descent)) / 2
  return lineIndex * lineHeight + halfLeading + metrics.ascent
}

export interface ShapeExtentOptions {
  lineHeight: number
  /** Height of the full-width band above the first line's box. */
  topHeight: number
  /** How far the bottom extends below the last baseline, for optical alignment: a flat
   *  edge exactly on the baseline reads as sitting slightly too high. */
  overshoot?: number
  metrics: FontMetrics
}

/**
 * The region the rag shape fills before the line boxes carve it:
 * - left: the text's left side (x = 0), not the padded boxes' left,
 * - top: the highest box top, raised by the top band,
 * - bottom: the last line's baseline plus `overshoot`, so the shape sits on the type like
 *   a base and reads as optically aligned with it.
 * Null when there's no text.
 */
export function shapeExtent(
  boxes: LineBox[],
  lines: LineMeasure[],
  { lineHeight, topHeight, overshoot = 0, metrics }: ShapeExtentOptions,
): ShapeExtent | null {
  const last = lines.at(-1)
  if (!last || boxes.length === 0) return null
  return {
    left: 0,
    top: Math.min(...boxes.map((b) => b.y)) - Math.max(0, topHeight),
    bottom: lineBaseline(last.index, lineHeight, metrics) + overshoot,
  }
}
