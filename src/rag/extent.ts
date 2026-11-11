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
  /** Where the shape starts on the left (default 0, the text's left side; centered text:
   *  shapeLeft). */
  left?: number
  /** With no text: the shape is this full block (top to bottom, from `left` to the edge),
   *  an uncarved cylinder once revolved. Omitted: no shape. */
  whenEmpty?: { top: number; bottom: number }
}

/**
 * The region the rag shape fills before the line boxes carve it:
 * - left: the text's left side (x = 0), not the padded boxes' left,
 * - top: the highest box top, raised by the top band,
 * - bottom: the last line's baseline plus `overshoot`, so the shape sits on the type like
 *   a base and reads as optically aligned with it.
 * With no text, `whenEmpty`'s block (no top band), or null.
 */
export function shapeExtent(
  boxes: LineBox[],
  lines: LineMeasure[],
  { lineHeight, topHeight, overshoot = 0, metrics, left = 0, whenEmpty }: ShapeExtentOptions,
): ShapeExtent | null {
  const last = lines.at(-1)
  if (!last || boxes.length === 0) {
    if (!whenEmpty || !(whenEmpty.bottom > whenEmpty.top)) return null
    return { left, top: whenEmpty.top, bandBottom: whenEmpty.top, bottom: whenEmpty.bottom }
  }
  const bandBottom = Math.min(...boxes.map((b) => b.y))
  return {
    left,
    top: bandBottom - Math.max(0, topHeight),
    bandBottom,
    bottom: lineBaseline(last.index, lineHeight, metrics) + overshoot,
  }
}

/** A rectangle in the text block's px coordinates (y down). */
export interface FrameRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * `extent` grown `amount` (0–1) of the way to covering `frame` once revolved around
 * `edgeX`: its left side out to the radius that reaches the farther of the frame's sides,
 * its top and bottom out to the frame's. The band's bottom stays put, so the boxes carve
 * the same. Only ever grows: sides already past the frame are kept.
 */
export function fillExtent(
  extent: ShapeExtent,
  frame: FrameRect,
  edgeX: number,
  amount: number,
): ShapeExtent {
  const t = Math.min(1, Math.max(0, amount))
  if (t === 0) return extent
  const radius = Math.max(edgeX - frame.left, frame.right - edgeX)
  const grow = (from: number, to: number) => from + (to - from) * t
  return {
    ...extent,
    left: grow(extent.left, Math.min(extent.left, edgeX - radius)),
    top: grow(extent.top, Math.min(extent.top, frame.top)),
    bottom: grow(extent.bottom, Math.max(extent.bottom, frame.bottom)),
  }
}
