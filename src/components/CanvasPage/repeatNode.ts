import { DEFAULT_SETTINGS } from '../../state'
import {
  DEFAULT_IMAGE_EXPORT,
  type FrameSize,
  type ImageExportOptions,
} from './sceneNode'

/** A repeat artboard's typography. The text node linked into it supplies only the wording. */
export interface RepeatTypography {
  fontFamily: string
  fontSize: number
  /** Line height in px (at scale 1). */
  lineHeight: number
  /** The text column's width, which is also the tile's width (px at scale 1): trophies repeat
   *  axis to axis by it, so each one's halves meet the rag of the text either side. Shown
   *  as **tile width**. */
  columnWidth: number
}

/** The repeat grid: proportional tile scale, independent spacing and overall offset. */
export interface RepeatLayout {
  /** Scale of a tile (proportional: trophy and type together). */
  scale: number
  /** One row's height (px at scale 1), independent of the artboard: the trophy from the
   *  tile's top (its top band bleeding just past it) down to its bottom margin
   *  (`ARTBOARD.padding`), where the text's last baseline sits. Taller text grows it. */
  tileHeight: number
  /** Extra gap between tiles (negative overlaps them; the pitch stays positive). */
  spacingX: number
  spacingY: number
  /** The grid's overall offset in artboard px. */
  offsetX: number
  offsetY: number
}

/** An independent repeat artboard: its own typography and grid, with the shared modifier
 *  nodes linked into it. Its artwork is generated from those inputs, not a scene snapshot. */
export interface RepeatNode {
  id: string
  name: string
  /** Its top-left on the canvas (canvas px). */
  x: number
  y: number
  frame: FrameSize
  typography: RepeatTypography
  layout: RepeatLayout
  /** The artboard's own background (transparent surroundings are the canvas's). */
  background: string
  imageExport: ImageExportOptions
}

/** RGD's repeat artwork on a 16:9 frame: big type (tight 1.0 leading) centered between
 *  trophies, the column half the frame, so a text gap sits in the middle with a trophy on
 *  each side and half a text block at each edge. */
export const DEFAULT_REPEAT_TYPOGRAPHY: RepeatTypography = {
  fontFamily: DEFAULT_SETTINGS.fontFamily,
  fontSize: 128,
  lineHeight: 128,
  columnWidth: 960,
}

export const DEFAULT_REPEAT_LAYOUT: RepeatLayout = {
  scale: 1,
  // A 16:9 frame's height: one row fills the default artboard.
  tileHeight: 1080,
  // Trophies repeat axis to axis by the column width: each one's halves meet the rag of the
  // text on either side. Rows abut: the tile already ends in a margin.
  spacingX: 0,
  spacingY: 0,
  offsetX: 0,
  offsetY: 0,
}

export const DEFAULT_REPEAT: Omit<RepeatNode, 'id' | 'name' | 'x' | 'y'> = {
  frame: { width: 1920, height: 1080 },
  typography: { ...DEFAULT_REPEAT_TYPOGRAPHY },
  layout: { ...DEFAULT_REPEAT_LAYOUT },
  background: '#ffffff',
  imageExport: { ...DEFAULT_IMAGE_EXPORT },
}

export function createRepeatNode(id: string, name: string, x: number, y: number): RepeatNode {
  return {
    id,
    name,
    x,
    y,
    frame: { ...DEFAULT_REPEAT.frame },
    typography: { ...DEFAULT_REPEAT.typography },
    layout: { ...DEFAULT_REPEAT.layout },
    background: DEFAULT_REPEAT.background,
    imageExport: { ...DEFAULT_REPEAT.imageExport },
  }
}

/** A layout edit, keeping the typography and other fields. */
export function withRepeatLayout(node: RepeatNode, patch: Partial<RepeatLayout>): RepeatNode {
  return { ...node, layout: { ...node.layout, ...patch } }
}

/** A typography edit. */
export function withRepeatTypography(
  node: RepeatNode,
  patch: Partial<RepeatTypography>,
): RepeatNode {
  return { ...node, typography: { ...node.typography, ...patch } }
}

/** A finite number, or the fallback. */
export function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Scale limits keep a malformed save from making an unusable grid. */
export const REPEAT_SCALE = { min: 0.05, max: 20 } as const
export const REPEAT_TILE_HEIGHT = { min: 64, max: 8192 } as const
export const REPEAT_SPACING = { min: -100_000, max: 100_000 } as const
export const REPEAT_OFFSET = { min: -1_000_000, max: 1_000_000 } as const

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function repeatScale(value: unknown, fallback = DEFAULT_REPEAT_LAYOUT.scale): number {
  return clamp(finite(value, fallback), REPEAT_SCALE.min, REPEAT_SCALE.max)
}

export function repeatTileHeight(
  value: unknown,
  fallback = DEFAULT_REPEAT_LAYOUT.tileHeight,
): number {
  return clamp(finite(value, fallback), REPEAT_TILE_HEIGHT.min, REPEAT_TILE_HEIGHT.max)
}

export function repeatSpacing(value: unknown, fallback = 0): number {
  return clamp(finite(value, fallback), REPEAT_SPACING.min, REPEAT_SPACING.max)
}

export function repeatOffset(value: unknown, fallback = 0): number {
  return clamp(finite(value, fallback), REPEAT_OFFSET.min, REPEAT_OFFSET.max)
}

export function repeatTypography(value: Partial<RepeatTypography>): RepeatTypography {
  return {
    fontFamily:
      typeof value.fontFamily === 'string' && value.fontFamily.trim()
        ? value.fontFamily
        : DEFAULT_REPEAT_TYPOGRAPHY.fontFamily,
    fontSize: clamp(finite(value.fontSize, DEFAULT_REPEAT_TYPOGRAPHY.fontSize), 1, 2000),
    lineHeight: clamp(finite(value.lineHeight, DEFAULT_REPEAT_TYPOGRAPHY.lineHeight), 1, 2000),
    columnWidth: clamp(
      finite(value.columnWidth, DEFAULT_REPEAT_TYPOGRAPHY.columnWidth),
      32,
      8192,
    ),
  }
}
