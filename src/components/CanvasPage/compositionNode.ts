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

/** Resize around the opposite corner, keeping dimensions positive. */
export function resizeCompositionImage(
  start: CompositionImageRect,
  corner: ImageCorner,
  dx: number,
  dy: number,
): CompositionImageRect {
  const left = corner.endsWith('left')
  const top = corner.startsWith('top')
  const width = Math.max(1, start.width + (left ? -dx : dx))
  const height = Math.max(1, start.height + (top ? -dy : dy))
  return {
    x: left ? start.x + start.width - width : start.x,
    y: top ? start.y + start.height - height : start.y,
    width,
    height,
  }
}
