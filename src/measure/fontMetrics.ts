import type { FontMetrics, Settings } from '../types'
import { toCanvasFont } from './font'

let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined

function measureContext() {
  if (context !== undefined) return context
  if (typeof OffscreenCanvas !== 'undefined') context = new OffscreenCanvas(1, 1).getContext('2d')
  else if (typeof document !== 'undefined')
    context = document.createElement('canvas').getContext('2d')
  else context = null
  return context
}

/**
 * The font's vertical metrics at this size, from canvas (the same engine Pretext measures
 * with): the font's ascent and descent, which CSS uses to place the baseline in a line box.
 * Precondition: the font is loaded (see `ensureFontLoaded`), or this measures a fallback.
 *
 * Falls back to 0.8 / 0.2 em where canvas lacks font-box metrics (e.g. node-canvas).
 */
export function measureFontMetrics(
  settings: Pick<Settings, 'fontFamily' | 'fontSize' | 'fontWeight'>,
): FontMetrics {
  const fallback = { ascent: settings.fontSize * 0.8, descent: settings.fontSize * 0.2 }
  const ctx = measureContext()
  if (!ctx) return fallback
  ctx.font = toCanvasFont(settings)
  const m = ctx.measureText('Hg')
  const ascent = m.fontBoundingBoxAscent
  const descent = m.fontBoundingBoxDescent
  return Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0
    ? { ascent, descent }
    : fallback
}
