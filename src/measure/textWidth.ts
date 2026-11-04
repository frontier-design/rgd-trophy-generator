// Pretext API reference: node_modules/@chenglou/pretext/dist/layout.d.ts and README.md
import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext'
import type { Settings } from '../types'
import { toCanvasFont } from './font'

/** The width of one line of `text` (px), measured like the text block's lines.
 *  Precondition: the font is loaded. */
export function measureTextWidth(
  text: string,
  settings: Pick<Settings, 'fontFamily' | 'fontSize' | 'fontWeight'>,
): number {
  return text ? measureNaturalWidth(prepareWithSegments(text, toCanvasFont(settings))) : 0
}
