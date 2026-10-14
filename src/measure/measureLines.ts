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
>

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
