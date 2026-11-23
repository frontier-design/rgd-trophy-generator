// Pretext API reference: node_modules/@chenglou/pretext/dist/layout.d.ts and README.md
import {
  layoutWithLines,
  measureNaturalWidth,
  prepareWithSegments,
  type PrepareOptions,
} from '@chenglou/pretext'
import type { LineMeasure, Settings } from '../types'
import { toCanvasFont } from './font'

export type MeasureSettings = Pick<
  Settings,
  'fontFamily' | 'fontSize' | 'fontWeight' | 'columnWidth' | 'lineHeight'
> &
  Partial<Pick<Settings, 'lineTracking'>>

export interface MeasureOptions {
  /** Passed through to Pretext's `prepareWithSegments(text, font, options)`. */
  prepare?: PrepareOptions
}

/**
 * Measure each wrapped line of `text` at the given font and column width.
 * Precondition: the font is loaded (see `ensureFontLoaded`).
 *
 * `width` is the *visible* width: trailing whitespace is excluded. Pretext already does
 * this for `whiteSpace: 'normal'`, but with `'pre-wrap'` its line width includes the
 * trailing spaces (which hang past the column, as in a textarea), so those lines are
 * re-measured without them. Pretext caches segment widths, so this is cheap.
 *
 * TODO: split into prepare + layout so `prepareWithSegments` (expensive: segmentation +
 * canvas measurement) only reruns when text/font change, and only the cheap layout step
 * reruns when columnWidth/lineHeight change. `walkLineRanges` avoids building line
 * strings if we only need widths.
 */
export function measureLines(
  text: string,
  settings: MeasureSettings,
  options: MeasureOptions = {},
): LineMeasure[] {
  const font = toCanvasFont(settings)
  const tracking = settings.lineTracking
  if (!tracking?.some((value) => value !== 0)) return measureBlock(text, font, settings, options)
  // Tracked: each hard line is measured on its own with its letter spacing (Pretext takes
  // one per prepare). Its wrapped lines follow on, renumbered.
  const hard = text.split('\n')
  const out: LineMeasure[] = []
  hard.forEach((part, i) => {
    // A break leaves an empty line, except after the last one (no line, as Pretext does
    // for a trailing break: the caret's row).
    if (!part) {
      if (i < hard.length - 1) out.push({ index: out.length, text: '', width: 0 })
      return
    }
    const spacing = ((tracking[i] ?? 0) / 1000) * settings.fontSize
    const prepare = spacing ? { ...options.prepare, letterSpacing: spacing } : options.prepare
    for (const line of measureBlock(part, font, settings, { prepare })) {
      // Pretext, like CSS, adds the spacing after the last letter too: the width is the ink's
      // (so boxes hug the letters), and drawing takes the trailing spacing back.
      const width = spacing && line.text.trim() ? Math.max(0, line.width - spacing) : line.width
      out.push({ ...line, index: out.length, width, ...(spacing ? { tracking: spacing } : {}) })
    }
  })
  return out
}

function measureBlock(
  text: string,
  font: string,
  settings: MeasureSettings,
  options: MeasureOptions,
): LineMeasure[] {
  const prepared = prepareWithSegments(text, font, options.prepare)
  const { lines } = layoutWithLines(prepared, settings.columnWidth, settings.lineHeight)
  return lines.map((line, index) => {
    const visible = line.text.trimEnd()
    const width =
      visible.length === line.text.length
        ? line.width
        : measureNaturalWidth(prepareWithSegments(visible, font, options.prepare))
    return { index, text: line.text, width }
  })
}
