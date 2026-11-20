// A pattern source's crop: a rectangle in normalized image coordinates (0–1 from its top
// left), kept apart from the source image so it is reversible, and the geometry the viewer's
// handles use. Pure (no DOM), so it can be tested and shared with the map builder.
import type { CropRect } from '../types'

/** The smallest crop, as a share of the image (keeps every crop nonzero). */
export const MIN_CROP = 0.02

/** The full image: the default crop. */
export const FULL_CROP: CropRect = Object.freeze({ x: 0, y: 0, width: 1, height: 1 })

/** A corner or edge of the crop box that can be dragged. */
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const CROP_HANDLES: readonly CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** A crop inside the image with nonzero (at least MIN_CROP) dimensions; anything malformed
 *  falls back to the full image. */
export function clampCrop(crop: Partial<CropRect> | null | undefined): CropRect {
  if (!crop || typeof crop !== 'object') return { ...FULL_CROP }
  const width = clamp(finite(crop.width, 1), MIN_CROP, 1)
  const height = clamp(finite(crop.height, 1), MIN_CROP, 1)
  return {
    x: clamp(finite(crop.x, 0), 0, 1 - width),
    y: clamp(finite(crop.y, 0), 0, 1 - height),
    width,
    height,
  }
}

/** Whether a crop is the whole image (so automatic margin trimming still applies). */
export function isFullCrop(crop: CropRect | null | undefined): boolean {
  if (!crop) return true
  return crop.x <= 1e-9 && crop.y <= 1e-9 && crop.width >= 1 - 1e-9 && crop.height >= 1 - 1e-9
}

/** The crop moved by `dx`/`dy` (fractions of the image), kept inside it. */
export function moveCrop(crop: CropRect, dx: number, dy: number): CropRect {
  const current = clampCrop(crop)
  return {
    ...current,
    x: clamp(current.x + finite(dx, 0), 0, 1 - current.width),
    y: clamp(current.y + finite(dy, 0), 0, 1 - current.height),
  }
}

/** The crop with one handle dragged by `dx`/`dy` (fractions of the image): the opposite edge
 *  stays put, the crop stays inside the image and never gets thinner than MIN_CROP. */
export function resizeCrop(
  crop: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  min = MIN_CROP,
): CropRect {
  const current = clampCrop(crop)
  const least = clamp(finite(min, MIN_CROP), Number.EPSILON, 1)
  let left = current.x
  let top = current.y
  let right = current.x + current.width
  let bottom = current.y + current.height
  const moveX = finite(dx, 0)
  const moveY = finite(dy, 0)
  if (handle.includes('w')) left = clamp(left + moveX, 0, right - least)
  if (handle.includes('e')) right = clamp(right + moveX, left + least, 1)
  if (handle.includes('n')) top = clamp(top + moveY, 0, bottom - least)
  if (handle.includes('s')) bottom = clamp(bottom + moveY, top + least, 1)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
