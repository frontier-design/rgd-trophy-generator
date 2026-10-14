import { useEffect, useState } from 'react'
import { ensureFontLoaded } from '../measure'

/**
 * True once `font` (canvas shorthand, see `toCanvasFont`) is loaded.
 * Measurement must wait for this; see the note on `ensureFontLoaded` for why.
 */
export function useFontLoaded(font: string): boolean {
  // Store *which* font finished loading, so switching fonts reads as "not loaded"
  // immediately without a synchronous setState in the effect.
  const [loadedFont, setLoadedFont] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureFontLoaded(font)
      .then(() => {
        if (!cancelled) setLoadedFont(font)
      })
      .catch((error: unknown) => {
        // TODO: surface font load failures in the UI.
        console.warn(`Failed to load font ${font}`, error)
      })
    return () => {
      cancelled = true
    }
  }, [font])

  return loadedFont === font
}
