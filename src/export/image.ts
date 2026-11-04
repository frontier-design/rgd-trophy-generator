// Still images of a frame: a Composition drawn at a scale, encoded as PNG or JPEG. No React.
import { drawComposition, type Composition } from './composite'

export type ImageFormat = 'png' | 'jpeg'

/** Image exports' scales (output px per frame px). */
export const IMAGE_SCALES = [1, 2, 3, 4, 5] as const

/** The largest side a frame can be rendered at (WebGL's usual limit; bigger silently comes
 *  out blurry) and the most pixels (browsers' canvas limits, and memory). */
const MAX_SIDE = 16384
const MAX_PIXELS = 100_000_000

/** The largest of IMAGE_SCALES a frame can be exported at. */
export function maxImageScale(width: number, height: number): number {
  const fits = (s: number) =>
    Math.max(width, height) * s <= MAX_SIDE && width * height * s * s <= MAX_PIXELS
  return [...IMAGE_SCALES].reverse().find(fits) ?? 1
}

/**
 * Draw `composition` at `scale` and encode it: PNG keeps transparency (a composition with no
 * background), JPEG is opaque (high quality, 0.92). Rejects if the browser can't encode it.
 */
export function renderImage(
  composition: Composition,
  scale: number,
  format: ImageFormat,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(composition.width * scale)
  canvas.height = Math.round(composition.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('No 2D canvas'))
  // JPEG has no alpha: a transparent frame would come out black, so it gets its color.
  const opaque =
    format === 'jpeg' && !composition.background
      ? { ...composition, background: '#ffffff' }
      : composition
  drawComposition(ctx, opaque, scale)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image"))),
      format === 'png' ? 'image/png' : 'image/jpeg',
      0.92,
    ),
  )
}
