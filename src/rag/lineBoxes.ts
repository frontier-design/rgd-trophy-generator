// Pure math only: no library imports allowed in rag/ (enforced by ESLint).
import type { LineBox, LineBoxStyle, LineMeasure, TextAlign } from '../types'

export interface LineBoxOptions extends LineBoxStyle {
  lineHeight: number
  /** Where each line starts in the column (px, by line index; alignOffsets), 0 if absent. */
  offsets?: readonly number[]
}

/**
 * Where each line starts in a column `columnWidth` wide (px, by line index): 0 left-aligned;
 * centered, half the space the line leaves.
 */
export function alignOffsets(
  lines: LineMeasure[],
  columnWidth: number,
  align: TextAlign,
): number[] {
  const offsets: number[] = []
  for (const line of lines)
    offsets[line.index] = align === 'center' ? Math.max(0, (columnWidth - line.width) / 2) : 0
  return offsets
}

/**
 * One box per measured line: the line's measured box (width × line height) grown by
 * padX/padY on each side (negative shrinks, never below zero size). A line that starts in
 * from the column's left (`offsets`, centered text) still has its box start at the text's left
 * side: it reaches to where the line ends, so the carving stays between the text and the axis.
 *
 * The radius is clamped here, once, to at most half the box's width and height, so the
 * CSS overlay and the Paper.js shape draw identical corners. (CSS and Paper.js clamp
 * oversized radii differently.)
 */
export function lineBoxes(lines: LineMeasure[], options: LineBoxOptions): LineBox[] {
  const { lineHeight, padX, padY, radius, offsets } = options
  return lines.map((line) => {
    const width = Math.max(0, (offsets?.[line.index] ?? 0) + line.width + 2 * padX)
    const height = Math.max(0, lineHeight + 2 * padY)
    return {
      lineIndex: line.index,
      x: 0 - padX, // not -padX, which is -0 when padX is 0
      y: line.index * lineHeight - padY,
      width,
      height,
      radius: Math.max(0, Math.min(radius, width / 2, height / 2)),
    }
  })
}
