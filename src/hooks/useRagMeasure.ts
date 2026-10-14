import { useMemo } from 'react'
import { measureFontMetrics, measureLines, toFontLoadQuery } from '../measure'
import type { FontMetrics, LineMeasure, Settings } from '../types'
import { useFontLoaded } from './useFontLoaded'

export interface RagMeasureResult {
  lines: LineMeasure[]
  /** Ascent/descent at the current size (for baselines). Measured once the font is ready. */
  metrics: FontMetrics
  fontReady: boolean
}

const NO_LINES: LineMeasure[] = []
// Text comes from a textarea, so keep the user's spaces and Enter-key line breaks.
const MEASURE_OPTIONS = { prepare: { whiteSpace: 'pre-wrap' } } as const

/** Measure the text's lines, but only once the chosen font has loaded. */
export function useRagMeasure(settings: Settings): RagMeasureResult {
  const { text, fontFamily, fontSize, fontWeight, columnWidth, lineHeight } = settings
  // Size-independent, so dragging the size slider doesn't reset fontReady on every step.
  const fontReady = useFontLoaded(toFontLoadQuery({ fontFamily, fontWeight }))

  const lines = useMemo(
    () =>
      fontReady
        ? measureLines(
            text,
            { fontFamily, fontSize, fontWeight, columnWidth, lineHeight },
            MEASURE_OPTIONS,
          )
        : NO_LINES,
    // TODO: memoize Pretext's prepare step on [text, font] separately from layout on
    // [columnWidth, lineHeight] (see measureLines TODO).
    [fontReady, text, fontFamily, fontSize, fontWeight, columnWidth, lineHeight],
  )

  // Measured only once the font is ready (like the lines), so a fallback font's metrics
  // never stick; until then a plain em-based estimate (nothing is drawn without lines).
  const metrics = useMemo<FontMetrics>(
    () =>
      fontReady
        ? measureFontMetrics({ fontFamily, fontSize, fontWeight })
        : { ascent: fontSize * 0.8, descent: fontSize * 0.2 },
    [fontReady, fontFamily, fontSize, fontWeight],
  )

  return { lines, metrics, fontReady }
}
