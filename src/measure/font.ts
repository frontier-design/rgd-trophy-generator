import type { Settings } from '../types'

/**
 * Build the canvas `font` shorthand Pretext expects (same format as `ctx.font`),
 * e.g. `400 18px "PP Mori"`. Must match the CSS used to display the same text.
 */
export function toCanvasFont(settings: Pick<Settings, 'fontFamily' | 'fontSize' | 'fontWeight'>) {
  return `${settings.fontWeight} ${settings.fontSize}px "${settings.fontFamily}"`
}

/**
 * Font shorthand for *loading* (not measuring): weight + family at a fixed size. Font
 * loading doesn't depend on size, so changing the size never re-triggers a load.
 */
export function toFontLoadQuery(settings: Pick<Settings, 'fontFamily' | 'fontWeight'>) {
  return toCanvasFont({ ...settings, fontSize: 16 })
}

/**
 * Resolve once the font described by `font` (canvas shorthand) is loaded and usable.
 *
 * WHY THIS MATTERS: Pretext measures text with canvas `measureText`. If the requested
 * font has not finished loading, the browser silently measures with a fallback font,
 * so every line width (and every line break) is wrong. Pretext also caches segment
 * widths per font string, so a measurement taken before load can stick around after
 * the real font arrives. Always await this before calling `measureLines`, and call
 * Pretext's `clearCache()` if you ever suspect a measurement ran too early.
 *
 * `document.fonts.load()` triggers loading of matching `@font-face` rules (canvas text
 * alone does not), and resolves with the loaded faces. For installed system fonts it
 * resolves immediately with an empty list, which is fine.
 */
export async function ensureFontLoaded(font: string, sampleText?: string): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document)) return false
  await document.fonts.load(font, sampleText)
  return document.fonts.check(font, sampleText)
}
