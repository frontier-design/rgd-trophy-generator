// Pure math only: no library imports allowed in rag/ (enforced by ESLint).
import type { LineBox, LineBoxStyle, LineMeasure } from '../types'

export interface LineBoxOptions extends LineBoxStyle {
  lineHeight: number
}

/**
 * One box per measured line: the line's measured box (width × line height) grown by
 * padX/padY on each side (negative shrinks, never below zero size).
 *
 * The radius is clamped here, once, to at most half the box's width and height, so the
 * CSS overlay and the Paper.js shape draw identical corners. (CSS and Paper.js clamp
 * oversized radii differently.)
 */
export function lineBoxes(lines: LineMeasure[], options: LineBoxOptions): LineBox[] {
  const { lineHeight, padX, padY, radius } = options
  return lines.map((line) => {
    const width = Math.max(0, line.width + 2 * padX)
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
