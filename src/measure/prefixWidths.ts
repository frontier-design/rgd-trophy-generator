// Pretext API reference: node_modules/@chenglou/pretext/dist/layout.d.ts and README.md
import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext'
import type { Settings } from '../types'
import { toCanvasFont } from './font'

/**
 * Widths of every prefix of `text` (`[0, width of the 1st character, of the first 2, …, of
 * all]`), for placing its letters one by one. Measured like the lines (Pretext, so kerning
 * and its cache are shared). Characters are code points. Precondition: the font is loaded.
 */
export function measurePrefixWidths(
  text: string,
  settings: Pick<Settings, 'fontFamily' | 'fontSize' | 'fontWeight'>,
  /** The line's letter spacing (CSS px; LineMeasure.tracking). */
  letterSpacing = 0,
): number[] {
  const font = toCanvasFont(settings)
  const options = letterSpacing ? { letterSpacing } : undefined
  const chars = Array.from(text)
  const widths = [0]
  for (let i = 1; i <= chars.length; i++) {
    // Where the letter's ink ends: without the spacing after it (as the line's width).
    widths.push(
      measureNaturalWidth(prepareWithSegments(chars.slice(0, i).join(''), font, options)) -
        letterSpacing,
    )
  }
  return widths
}
