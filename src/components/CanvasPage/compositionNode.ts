import type { FrameRect } from './sceneNode'

/** Image coordinates are relative to the composition frame, in canvas pixels. */
export type CompositionImageRect = FrameRect

export interface CompositionNode {
  id: string
  name: string
  /** Frame top-left in canvas coordinates. */
  x: number
  y: number
  frame: { width: number; height: number }
  image: CompositionImageRect
}

export const IMAGE_CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const
export type ImageCorner = (typeof IMAGE_CORNERS)[number]

/** Resize around the opposite corner, always keeping the image's aspect ratio: the scale
 *  follows the drag projected onto the image's diagonal (so pulling either side, in or out,
 *  resizes it). */
export function resizeCompositionImage(
  start: CompositionImageRect,
  corner: ImageCorner,
  dx: number,
  dy: number,
): CompositionImageRect {
  const left = corner.endsWith('left')
  const top = corner.startsWith('top')
  // The drag outward from the corner, along each side.
  const outX = left ? -dx : dx
  const outY = top ? -dy : dy
  const { width: w, height: h } = start
  const projected = 1 + (outX * w + outY * h) / (w * w + h * h)
  // At least 1 px on the shorter side.
  const scale = Math.max(1 / Math.min(w, h), projected)
  const width = start.width * scale
  const height = start.height * scale
  return {
    x: left ? start.x + start.width - width : start.x,
    y: top ? start.y + start.height - height : start.y,
    width,
    height,
  }
}
