import type { FontMetrics } from '../types'
import { lineBaseline } from './extent'

export interface FrameFitOptions {
  /** The widest line's width at `fontSize` (px). */
  widest: number
  lineCount: number
  /** The size the text was measured at (px). */
  fontSize: number
  /** Line height as a multiple of the size (kept as it is). */
  leading: number
  /** Ascent and descent at `fontSize`. */
  metrics: FontMetrics
  /** The frame and its one margin (px). */
  frame: { width: number; height: number; padding: number }
  /** How far above the frame's bottom the trophy ends (px). */
  bottomClearance: number
  /** How far the trophy's bottom reaches below the last baseline (px). */
  overshoot: number
  /** The line boxes' padding (px, at `fontSize` if `scalePad`). */
  padX: number
  padY: number
  /** The padding grows with the type (the boxes keep their proportions to it). */
  scalePad?: boolean
  /** The share of the radius the widest line, with its box, carves (the rest is stem). */
  carve: number
  /** Least room above the first box (px): the top band plus the top margin. */
  minTop: number
}

export interface FrameFit {
  fontSize: number
  lineHeight: number
  /** The edge: the frame's middle, so the text and its mirror span the frame. */
  columnWidth: number
  /** The top band, reaching from the first box up to the frame's top margin. */
  topHeight: number
  /** The fitted size over the measured one (to scale other px values with the type). */
  scale: number
}

/**
 * Fits a mirrored composition to the frame's margin: the edge in the frame's middle, the
 * type sized so the widest line carves `carve` of the radius (or smaller, if the text would
 * leave less than `minTop` for the top band), the trophy's bottom `bottomClearance` above
 * the frame's bottom, and the top band reaching up to the top margin. Line widths scale with
 * the type size, so the text is measured once, at any size.
 */
export function fitToFrame(o: FrameFitOptions): FrameFit {
  const { frame, fontSize, widest, leading } = o
  const edge = frame.width / 2 - frame.padding
  const trophyBottom = frame.height - o.bottomClearance
  // Per px of type size, the last baseline is this far below the text's top.
  const baselinePerSize = lineBaseline(o.lineCount - 1, leading, {
    ascent: o.metrics.ascent / fontSize,
    descent: o.metrics.descent / fontSize,
  })
  const room = trophyBottom - o.overshoot - o.minTop
  const size = o.scalePad
    ? Math.min(
        (o.carve * edge * fontSize) / (widest + o.padX),
        room / (baselinePerSize + o.padY / fontSize),
      )
    : Math.min((fontSize * (o.carve * edge - o.padX)) / widest, (room - o.padY) / baselinePerSize)
  const scale = size / fontSize
  const padY = o.scalePad ? o.padY * scale : o.padY
  const textTop = trophyBottom - o.overshoot - size * baselinePerSize
  return {
    fontSize: size,
    lineHeight: size * leading,
    columnWidth: edge,
    topHeight: Math.max(0, textTop - padY - frame.padding),
    scale,
  }
}
