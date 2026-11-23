import { ARTBOARD } from '../../state'
import type { FrameSize } from './sceneNode'
import { textDuration, textSegments, type TextParams } from './textLines'

/** Frame rates a record node can play its frames back at. */
export const RECORD_FPS = [24, 25, 30, 50, 60] as const
export const DEFAULT_RECORD_FPS = 30

/** Seconds of the scene before the text animation starts, and after it ends. */
export const DEFAULT_RECORD_HOLD_IN = 0.5
export const DEFAULT_RECORD_HOLD_OUT = 1
export const RECORD_HOLD_RANGE = { min: 0, max: 10 } as const

/**
 * Record: an MP4 of the scene linked into it, rendered on its own clock: `holdIn` seconds
 * before its linked text node's animation (typing, and deleting with backspace on), the
 * animation, then `holdOut` seconds of its end state; frame i shows time i / fps. Every
 * frame is drawn however long it takes, so a slow browser makes a slow export, never a
 * skipped frame. It has no size of its own: it takes its input's frame, at the input's
 * export scale (up to ×3).
 */
export interface RecordNode {
  id: string
  name: string
  /** Its top-left on the canvas (canvas px). */
  x: number
  y: number
  fps: number
  holdIn: number
  holdOut: number
}

/** How much smaller than its video a record node's artboard is drawn: it's only a preview
 *  (nothing on it is edited). */
export const RECORD_PREVIEW_SCALE = 1 / 4

/** A record node as it is drawn: `video` is its input's frame (or the default frame,
 *  unlinked), the size it renders at; `frame`, the artboard on the canvas (links, hits), that
 *  at RECORD_PREVIEW_SCALE. */
export type PlacedRecordNode = RecordNode & { frame: FrameSize; video: FrameSize }

/** A record node's artboard on the canvas for a video size. */
export function recordPreviewFrame(video: FrameSize): FrameSize {
  return {
    width: Math.round(video.width * RECORD_PREVIEW_SCALE),
    height: Math.round(video.height * RECORD_PREVIEW_SCALE),
  }
}

export function createRecordNode(id: string, name: string, x: number, y: number): RecordNode {
  return {
    id,
    name,
    x,
    y,
    fps: DEFAULT_RECORD_FPS,
    holdIn: DEFAULT_RECORD_HOLD_IN,
    holdOut: DEFAULT_RECORD_HOLD_OUT,
  }
}

/** A hold within its range, or `fallback`. */
export function recordHold(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(RECORD_HOLD_RANGE.max, Math.max(RECORD_HOLD_RANGE.min, value))
    : fallback
}

/** One row of a record node's timeline (s from the video's start). */
export interface TimelineRow {
  kind: 'hold-in' | 'line' | 'pause' | 'delete' | 'hold-out'
  /** The text line's index, for `line`. */
  index?: number
  label: string
  start: number
  end: number
  /** A line's hold after its typing: a second bar in its row. */
  hold?: { start: number; end: number }
}

/** A record node's timeline: the hold in, each text line typing (one row each, with its
 *  hold), the pause and the deleting (backspace on), the hold out; and the video's length. */
export function recordTimeline(
  holdIn: number,
  holdOut: number,
  text: TextParams | null,
): { rows: TimelineRow[]; duration: number } {
  const rows: TimelineRow[] = [{ kind: 'hold-in', label: 'hold in', start: 0, end: holdIn }]
  for (const segment of text ? textSegments(text) : []) {
    const start = holdIn + segment.start
    const end = holdIn + segment.end
    if (segment.kind === 'line') {
      const index = segment.index ?? 0
      const words = text?.lines[index]?.text.trim()
      rows.push({ kind: 'line', index, label: words || `line ${index + 1}`, start, end })
    } else if (segment.kind === 'hold') {
      const row = rows.at(-1)
      if (row?.kind === 'line') row.hold = { start, end }
    } else rows.push({ kind: segment.kind, label: segment.kind, start, end })
  }
  const animation = holdIn + (text ? textDuration(text) : 0)
  rows.push({ kind: 'hold-out', label: 'hold out', start: animation, end: animation + holdOut })
  return { rows, duration: animation + holdOut }
}

/** A saved frame rate, or the default. */
export function recordFps(value: unknown): number {
  return RECORD_FPS.includes(value as (typeof RECORD_FPS)[number])
    ? (value as number)
    : DEFAULT_RECORD_FPS
}

/** The frame a record node takes: its input's, or the default artboard's when unlinked. */
export function recordFrame(input: FrameSize | undefined): FrameSize {
  return input ? { width: input.width, height: input.height } : { ...ARTBOARD_FRAME }
}

const ARTBOARD_FRAME: FrameSize = { width: ARTBOARD.width, height: ARTBOARD.height }
