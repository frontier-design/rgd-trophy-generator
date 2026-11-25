// Ordered dithering for node previews (pure: no React).

/** A 4 × 4 Bayer matrix: ordered dithering's thresholds (0…15). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/**
 * Tone (0…1 a pixel) as an ordered dither: each pixel black where its tone passes the Bayer
 * threshold at its place, else clear, so mid tones read as even dot screens and full tones
 * as solid black.
 */
export function ditherTone(tone: Float32Array, width: number): Uint8Array {
  const out = new Uint8Array(tone.length)
  for (let i = 0; i < tone.length; i++) {
    const x = i % width
    const y = Math.floor(i / width)
    const threshold = (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16
    out[i] = Math.min(1, Math.max(0, tone[i]!)) > threshold ? 1 : 0
  }
  return out
}
