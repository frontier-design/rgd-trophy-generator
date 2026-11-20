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
  /** The text column's width, also the repeat tile's width (px at scale 1). */
  columnWidth: number
}

/** The repeat grid: proportional tile scale, independent spacing and overall offset. */
export interface RepeatLayout {
  /** Scale of a tile (proportional: trophy and type together). */
  scale: number
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

export const DEFAULT_REPEAT_TYPOGRAPHY: RepeatTypography = {
  fontFamily: DEFAULT_SETTINGS.fontFamily,
  fontSize: DEFAULT_SETTINGS.fontSize,
  lineHeight: DEFAULT_SETTINGS.lineHeight,
  columnWidth: DEFAULT_SETTINGS.columnWidth,
}

export const DEFAULT_REPEAT_LAYOUT: RepeatLayout = {
  scale: 1,
  // A trophy-width gap is the default: one regular tile per column.
  spacingX: 180,
  spacingY: 24,
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
export const REPEAT_SPACING = { min: -100_000, max: 100_000 } as const
export const REPEAT_OFFSET = { min: -1_000_000, max: 1_000_000 } as const

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function repeatScale(value: unknown, fallback = DEFAULT_REPEAT_LAYOUT.scale): number {
  return clamp(finite(value, fallback), REPEAT_SCALE.min, REPEAT_SCALE.max)
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
