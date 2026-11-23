import { setLetterSpacing, trackedX } from '../../export'
import type { ImageExportOptions } from './sceneNode'
import { finite, repeatOffset, repeatScale, repeatSpacing, type RepeatNode } from './repeatNode'

/** Minimum repeat pitch (px): negative spacing may overlap copies, but the grid stays
 *  traversable and finite. */
export const REPEAT_MIN_PITCH = 1
/** Safety limits for a malformed save (or an absurd scale): draw only visible copies. */
export const REPEAT_MAX_PER_AXIS = 160
export const REPEAT_MAX_TILES = 12_000

export interface RepeatTrophy {
  /** The rendered trophy's size in source px (one shared render, reused for every copy). */
  width: number
  height: number
  /** Where its center sits in the source frame. */
  centerX: number
  centerY: number
  /** The horizontal repeat unit (px at scale 1), when it isn't the trophy's width: for
   *  centered text, the column width (trophy axis to axis, one text gap between), so each
   *  trophy's mirrored half meets the next copy's rag. */
  pitchWidth?: number
  /** Where the trophy's center naturally sits in the repeat frame (y, px at scale 1). Given,
   *  the grid is placed relative to the frame: a text gap centered across it, the row at
   *  this height (scaled about the frame's middle), and the layout's offsets add to that. */
  restY?: number
  /** The vertical repeat unit (px at scale 1), when it isn't the trophy's height: the
   *  tile's height (trophy plus its bottom margin). */
  pitchHeight?: number
}

export interface RepeatGrid {
  /** Repeat pitch (always positive). */
  pitchX: number
  pitchY: number
  /** Trophy centers, in artboard px (before drawing). */
  offsetX: number
  offsetY: number
  /** The visible indices (start/count) on each axis. */
  columns: { first: number; count: number }
  rows: { first: number; count: number }
  /** The scaled trophy size. */
  tileWidth: number
  tileHeight: number
}

/** The repeat pitch: the tile's scaled size plus its gap, never zero or negative. */
export function repeatPitch(tile: number, spacing: number, scale: number): number {
  const scaled = (finite(tile, 1) + repeatSpacing(spacing)) * repeatScale(scale)
  return Math.max(REPEAT_MIN_PITCH, scaled)
}

/** The visible index range: copies whose (scaled) tile can touch the frame, plus one column
 *  because a row's centered text sits half a pitch past each trophy. Bounded. */
function visibleRange(
  offset: number,
  pitch: number,
  frame: number,
  halfExtent: number,
  extra: number,
): { first: number; count: number } {
  const min = -halfExtent
  const max = frame + halfExtent
  let first = Math.floor((min - offset) / pitch) - extra
  let last = Math.ceil((max - offset) / pitch) + extra
  if (!Number.isFinite(first) || !Number.isFinite(last)) return { first: 0, count: 1 }
  if (last - first + 1 > REPEAT_MAX_PER_AXIS) {
    const center = Math.round((frame / 2 - offset) / pitch)
    first = center - Math.floor(REPEAT_MAX_PER_AXIS / 2)
    last = first + REPEAT_MAX_PER_AXIS - 1
  }
  return { first, count: last - first + 1 }
}

/** The grid a repeat artboard draws: proportional tile scale, independent X/Y spacing and
 *  offsets, with only the visible copies (and one covering the clipped edges). */
export function repeatGrid(
  frame: { width: number; height: number },
  node: Pick<RepeatNode, 'layout'>,
  trophy: Pick<RepeatTrophy, 'width' | 'height' | 'pitchWidth' | 'pitchHeight' | 'restY'>,
): RepeatGrid {
  const scale = repeatScale(node.layout.scale)
  const tileWidth = Math.max(REPEAT_MIN_PITCH, finite(trophy.width, 1) * scale)
  const tileHeight = Math.max(REPEAT_MIN_PITCH, finite(trophy.height, 1) * scale)
  const pitchX = repeatPitch(trophy.pitchWidth ?? trophy.width, node.layout.spacingX, scale)
  const pitchY = repeatPitch(trophy.pitchHeight ?? trophy.height, node.layout.spacingY, scale)
  let offsetX = repeatOffset(node.layout.offsetX)
  let offsetY = repeatOffset(node.layout.offsetY)
  if (trophy.restY !== undefined) {
    const width = finite(frame.width, 1)
    const height = finite(frame.height, 1)
    // A trophy half a pitch right of the middle: a text gap centered on the frame.
    offsetX += width / 2 + pitchX / 2
    offsetY += height / 2 + (finite(trophy.restY, height / 2) - height / 2) * scale
  }
  const columns = visibleRange(offsetX, pitchX, finite(frame.width, 1), tileWidth / 2, 1)
  const rows = visibleRange(offsetY, pitchY, finite(frame.height, 1), tileHeight / 2, 0)
  // Keep the number of drawn copies bounded even with an extreme frame/scale.
  const cap = Math.max(1, Math.floor(Math.sqrt(REPEAT_MAX_TILES)))
  if (columns.count > cap) columns.count = cap
  if (rows.count > cap) rows.count = cap
  return { pitchX, pitchY, offsetX, offsetY, columns, rows, tileWidth, tileHeight }
}

/** Everything needed to draw the repeat: one trophy render, the text's lines and baselines
 *  in the source frame, and the artboard's own typography and background. */
export interface RepeatArtwork {
  frame: { width: number; height: number }
  node: Pick<RepeatNode, 'layout' | 'typography' | 'background'>
  trophy: RepeatTrophy
  /** The source frame's image (the one shared trophy render). */
  image: CanvasImageSource | null
  sourceWidth: number
  sourceHeight: number
  /** Text's baselines in source-frame coordinates. */
  baselines: number[]
  lines: string[]
  /** Per line, its letter spacing (source px), when tracked. */
  letterSpacing?: number[]
  textColor: string
  fontWeight: number
  pixelRatio?: number
  /** Identity of the shared 3D render and modifier inputs: changing them redraws all copies. */
  revision?: unknown
}

/** Draw the repeat onto `ctx` in artboard px (the caller scales for output). Copies are
 *  transparent, and clipped at the frame; `transparent` omits the artboard background. */
export function drawRepeatArtwork(
  ctx: CanvasRenderingContext2D,
  artwork: RepeatArtwork,
  options: { transparent?: boolean } = {},
): void {
  const { frame, node, trophy, image, sourceWidth, sourceHeight, baselines, lines } = artwork
  const { pitchX, pitchY, offsetX, offsetY, columns, rows } = repeatGrid(frame, node, trophy)
  const scale = repeatScale(node.layout.scale)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, frame.width, frame.height)
  ctx.clip()
  if (!options.transparent) {
    ctx.fillStyle = node.background || '#ffffff'
    ctx.fillRect(0, 0, frame.width, frame.height)
  } else {
    ctx.clearRect(0, 0, frame.width, frame.height)
  }
  if (image && sourceWidth > 0 && sourceHeight > 0) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    for (let row = 0; row < rows.count; row++) {
      const cy = offsetY + (rows.first + row) * pitchY
      for (let column = 0; column < columns.count; column++) {
        const cx = offsetX + (columns.first + column) * pitchX
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(scale, scale)
        ctx.translate(-trophy.centerX, -trophy.centerY)
        ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight)
        ctx.restore()
      }
    }
  }
  // One centered copy per gap, on the same baseline in every row.
  const font = `${artwork.fontWeight} ${artwork.node.typography.fontSize * scale}px "${artwork.node.typography.fontFamily}"`
  ctx.font = font
  ctx.fillStyle = artwork.textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  for (let row = 0; row < rows.count; row++) {
    const cy = offsetY + (rows.first + row) * pitchY
    const textX = offsetX + (columns.first + 0.5) * pitchX
    for (let column = 0; column < columns.count; column++) {
      const x = textX + column * pitchX
      for (let line = 0; line < lines.length; line++) {
        const baseline = baselines[line]
        if (baseline === undefined) continue
        const y = cy + (baseline - trophy.centerY) * scale
        const spacing = (artwork.letterSpacing?.[line] ?? 0) * scale
        setLetterSpacing(ctx, spacing)
        ctx.fillText(lines[line]!, trackedX(x, 'center', spacing), y)
      }
    }
  }
  setLetterSpacing(ctx, 0)
  ctx.restore()
}

/** Draw at output scale and encode as PNG/JPEG. A transparent PNG leaves the artboard's
 *  background out but keeps the same clipped frame. */
export function renderRepeatArtwork(
  artwork: RepeatArtwork,
  options: ImageExportOptions,
): Promise<Blob> {
  const scale = Math.max(1, Math.round(finiteScale(options.scale)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(artwork.frame.width * scale))
  canvas.height = Math.max(1, Math.round(artwork.frame.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('No 2D canvas'))
  ctx.scale(scale, scale)
  const transparent = options.format === 'png' && options.transparent
  drawRepeatArtwork(ctx, artwork, { transparent })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image"))),
      options.format === 'jpeg' ? 'image/jpeg' : 'image/png',
      0.92,
    )
  })
}

function finiteScale(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 1
}

/** A malformed saved layout's effective pitch (for persistence tests and UI readouts). */
export function repeatNodePitch(
  node: RepeatNode,
  trophy: { width: number; height: number; pitchWidth?: number; pitchHeight?: number },
): { pitchX: number; pitchY: number } {
  return {
    pitchX: repeatPitch(trophy.pitchWidth ?? trophy.width, node.layout.spacingX, node.layout.scale),
    pitchY: repeatPitch(trophy.pitchHeight ?? trophy.height, node.layout.spacingY, node.layout.scale),
  }
}
