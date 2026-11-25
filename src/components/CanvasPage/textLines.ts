/**
 * A text node's lines: each hard line of the text with its own typing speed and tracking.
 * Pure (no React), so the editor's keyboard edits and the typing playback are unit-tested.
 */

/** One line of a text node. */
export interface TextLine {
  text: string
  /** Typing playback speed: characters per second. */
  speed: number
  /** Letter spacing, in thousandths of an em (as in type tools), so it scales with the
   *  type size (scenes refit their size to the frame). */
  tracking: number
  /** Seconds the animation waits after this line is typed, before the next line starts
   *  (absent or 0: no hold). */
  hold?: number
}

/** Deleting the text after it's typed: one character at a time from the end, `speed` a
 *  second, `pause` seconds after the typing ends. */
export interface TextBackspace {
  enabled: boolean
  /** Seconds on the whole text before deleting starts. */
  pause: number
  /** Characters deleted per second. */
  speed: number
}

/** A typing preview's place: characters typed of all of them (the mask), and, when it's
 *  timed (playing, scrubbed, rendering), seconds in and each line's typing (s): what nodes'
 *  animated properties follow. */
export interface TextProgress {
  typed: number
  total: number
  time?: number
  /** Each line's typing (s): from its start to its end, and when its first letter appears. */
  lines?: { start: number; end: number; first: number }[]
  /** With backspace on: when each line is deleted (s; from the end, so the last line
   *  first). */
  deletes?: { start: number; end: number }[]
}

export interface TextParams {
  lines: TextLine[]
  /** Absent in saves from before backspacing (off). */
  backspace?: TextBackspace
  /** Mask the trophy to the typed lines: while typing, linked scenes show only the band of
   *  the trophy from the first line down; its top (no text) shows over the last few
   *  characters (`textMask`). */
  mask?: boolean
  /** Typed letter by letter (absent: on). Off, each line appears whole at its turn (holds
   *  and backspace still play). */
  typing?: boolean
  /** Type size (px) for linked scenes; absent: each scene keeps its own (fitted to its
   *  frame). The font is always PP Mori. */
  fontSize?: number
  /** Line height as a multiple of the size; absent: each scene's own. */
  leading?: number
  /** Set on typing previews only (never saved): characters typed of all of them, for the
   *  mask. Absent: all typed. */
  progress?: TextProgress
}

export const DEFAULT_LINE_SPEED = 8
/** New lines' tracking: a touch tight, as display type sets best. */
export const DEFAULT_TRACKING = -3
export const LINE_SPEED_RANGE = { min: 0.25, max: 18, step: 0.25 } as const
export const TRACKING_RANGE = { min: -95, max: 25, step: 1 } as const

export const LINE_HOLD_RANGE = { min: 0.1, max: 30, step: 0.1 } as const
/** A line's hold when its checkbox is ticked. */
export const DEFAULT_LINE_HOLD = 0.5

/** A line's hold (s), 0 when it has none. */
export const lineHold = (line: TextLine) => (line.hold && line.hold > 0 ? line.hold : 0)

export const BACKSPACE_PAUSE_RANGE = { min: 0, max: 10, step: 0.1 } as const
export const BACKSPACE_SPEED_RANGE = { min: 1, max: 60, step: 1 } as const
export const DEFAULT_BACKSPACE: TextBackspace = { enabled: false, pause: 1, speed: 20 }

/** A line's style, the defaults when there's none to inherit. */
const style = (from?: TextLine) => ({
  speed: from?.speed ?? DEFAULT_LINE_SPEED,
  tracking: from?.tracking ?? DEFAULT_TRACKING,
})

/** The node's text: its lines joined by line breaks. */
export function textOf(lines: readonly TextLine[]): string {
  return lines.map((line) => line.text).join('\n')
}

/** Lines for `text`, keeping each line's style from `previous` by position (new lines take
 *  the last previous line's style). Always at least one line. */
export function linesFromText(text: string, previous: readonly TextLine[] = []): TextLine[] {
  return text.split('\n').map((part, i) => {
    const prior = previous[i]
    if (prior?.text === part) return prior
    // An edited line keeps its hold; a new one doesn't take another's.
    const hold = prior ? lineHold(prior) : 0
    return { text: part, ...style(prior ?? previous.at(-1)), ...(hold ? { hold } : {}) }
  })
}

/** Each line's tracking (thousandths of an em), or undefined when none is tracked (so
 *  untracked text measures and renders as before). */
export function lineTracking(lines: readonly TextLine[]): number[] | undefined {
  return lines.some((line) => line.tracking !== 0) ? lines.map((line) => line.tracking) : undefined
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** A saved backspace, validated (none: off, so it isn't written into old nodes). */
function withBackspace(params: TextParams, raw: unknown): TextParams {
  if (!raw || typeof raw !== 'object') return params
  const value = raw as Record<string, unknown>
  const number = (v: unknown, fallback: number, range: { min: number; max: number }) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, range.min, range.max) : fallback
  return {
    ...params,
    backspace: {
      enabled: value.enabled === true,
      pause: number(value.pause, DEFAULT_BACKSPACE.pause, BACKSPACE_PAUSE_RANGE),
      speed: number(value.speed, DEFAULT_BACKSPACE.speed, BACKSPACE_SPEED_RANGE),
    },
  }
}

/** A saved node's params, validated: `lines`, or a legacy `text` string. */
export function parseTextParams(params: Record<string, unknown>, fallback: string): TextParams {
  const parsed = withBackspace(parseTextLines(params, fallback), params.backspace)
  const number = (v: unknown, range: { min: number; max: number }) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, range.min, range.max) : undefined
  const fontSize = number(params.fontSize, TEXT_SIZE_RANGE)
  const leading = number(params.leading, TEXT_LEADING_RANGE)
  return {
    ...parsed,
    ...(params.mask === true ? { mask: true } : {}),
    ...(params.typing === false ? { typing: false } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(leading !== undefined ? { leading } : {}),
  }
}

/** A text node's type size (px) and line height (× size) ranges. */
export const TEXT_SIZE_RANGE = { min: 12, max: 300, step: 0.1 } as const
export const TEXT_LEADING_RANGE = { min: 0.7, max: 2.5, step: 0.01 } as const

/** A scene's type with a text node's size and leading over it (where the node sets them). */
export function withTextType<T extends { fontSize: number; lineHeight: number }>(
  settings: T,
  type: { fontSize?: number; leading?: number } | undefined,
): T {
  if (type?.fontSize === undefined && type?.leading === undefined) return settings
  const fontSize = type.fontSize ?? settings.fontSize
  const leading = type.leading ?? settings.lineHeight / settings.fontSize
  return { ...settings, fontSize, lineHeight: fontSize * leading }
}

function parseTextLines(params: Record<string, unknown>, fallback: string): TextParams {
  if (Array.isArray(params.lines)) {
    const lines = params.lines.flatMap((raw): TextLine[] => {
      if (!raw || typeof raw !== 'object') return []
      const line = raw as Record<string, unknown>
      if (typeof line.text !== 'string') return []
      const number = (
        value: unknown,
        fallbackValue: number,
        range: { min: number; max: number },
      ) =>
        typeof value === 'number' && Number.isFinite(value)
          ? clamp(value, range.min, range.max)
          : fallbackValue
      return [
        {
          // A line never holds a break (the lines are the breaks).
          text: line.text.replace(/\r?\n/g, ' '),
          speed: number(line.speed, DEFAULT_LINE_SPEED, LINE_SPEED_RANGE),
          tracking: number(line.tracking, DEFAULT_TRACKING, TRACKING_RANGE),
          ...(typeof line.hold === 'number' && line.hold > 0
            ? { hold: number(line.hold, DEFAULT_LINE_HOLD, LINE_HOLD_RANGE) }
            : {}),
        },
      ]
    })
    if (lines.length) return { lines }
  }
  return { lines: linesFromText(typeof params.text === 'string' ? params.text : fallback) }
}

// --- Editing: the lines behave like one textarea. Each edit returns the new lines and
// where the caret goes (line, code-unit offset, as an input's selection is).

export interface Caret {
  line: number
  offset: number
}
export interface LineEdit {
  lines: TextLine[]
  caret: Caret
}

/** Enter at `offset` in line `index`: at the end, to the next line (a new one after the
 *  last); elsewhere the line splits there, its rest going to a new line with its style. */
export function enterAt(lines: readonly TextLine[], index: number, offset: number): LineEdit {
  const line = lines[index]!
  if (offset >= line.text.length && index < lines.length - 1)
    return { lines: [...lines], caret: { line: index + 1, offset: 0 } }
  const next = [...lines]
  next.splice(
    index,
    1,
    { ...line, text: line.text.slice(0, offset) },
    { ...line, text: line.text.slice(offset) },
  )
  return { lines: next, caret: { line: index + 1, offset: 0 } }
}

/** Backspace at a line's start: joins it onto the end of the line before. */
export function joinWithPrevious(lines: readonly TextLine[], index: number): LineEdit | null {
  if (index <= 0) return null
  const before = lines[index - 1]!
  const next = [...lines]
  next.splice(index - 1, 2, { ...before, text: before.text + lines[index]!.text })
  return { lines: next, caret: { line: index - 1, offset: before.text.length } }
}

/** Delete at a line's end: joins the next line onto it. */
export function joinWithNext(lines: readonly TextLine[], index: number): LineEdit | null {
  if (index >= lines.length - 1) return null
  const line = lines[index]!
  const next = [...lines]
  next.splice(index, 2, { ...line, text: line.text + lines[index + 1]!.text })
  return { lines: next, caret: { line: index, offset: line.text.length } }
}

/** Typing or pasting `text` over [start, end) of line `index`: breaks in it make new lines
 *  (with the line's style), as pasting into a textarea would. */
export function insertText(
  lines: readonly TextLine[],
  index: number,
  start: number,
  end: number,
  text: string,
): LineEdit {
  const line = lines[index]!
  const parts = text.replace(/\r\n?/g, '\n').split('\n')
  const head = line.text.slice(0, start)
  const tail = line.text.slice(end)
  const made = parts.map((part, i) => ({
    ...line,
    text: (i === 0 ? head : '') + part + (i === parts.length - 1 ? tail : ''),
  }))
  const next = [...lines]
  next.splice(index, 1, ...made)
  const last = parts.length - 1
  return {
    lines: next,
    caret: { line: index + last, offset: (last === 0 ? head.length : 0) + parts[last]!.length },
  }
}

// --- Typing playback: each line types at its own speed, one after another.

/** How long typing all of `lines` takes (s). */
export function typingDuration(lines: readonly TextLine[]): number {
  return lines.reduce(
    (sum, line) => sum + Array.from(line.text).length / line.speed + lineHold(line),
    0,
  )
}

/** The text typed `elapsed` seconds in: every finished line, and the current one as far as
 *  its speed has reached (whole characters, code points); during a line's hold, the lines so
 *  far (the next line not begun). Null once it's all typed (holds included). */
export function typedText(lines: readonly TextLine[], elapsed: number): string | null {
  let time = Math.max(0, elapsed)
  const typed: string[] = []
  for (const line of lines) {
    const chars = Array.from(line.text)
    const duration = chars.length / line.speed
    if (time < duration) {
      typed.push(chars.slice(0, Math.floor(time * line.speed)).join(''))
      return typed.join('\n')
    }
    time -= duration
    typed.push(line.text)
    const hold = lineHold(line)
    if (hold && time < hold) return typed.join('\n')
    time -= hold
  }
  return null
}

/** The lines as the animation times them: typing off, each appears at once (no time to
 *  type it), else at its own speed. */
export function timedLines(params: Pick<TextParams, 'lines' | 'typing'>): TextLine[] {
  return params.typing === false
    ? params.lines.map((line) => ({ ...line, speed: Number.POSITIVE_INFINITY }))
    : params.lines
}

// --- The whole animation: the lines typed one after another, then (with backspace) a
// pause on the whole text and the text deleted from the end.

/** All the characters of `lines` (code points; line breaks aren't typed). */
function characterCount(lines: readonly TextLine[]): number {
  return lines.reduce((sum, line) => sum + Array.from(line.text).length, 0)
}

/** The text with only its first `count` characters typed, as `typedText` shows it partway
 *  (a finished line's break comes with it, the next line empty). */
export function prefixText(lines: readonly TextLine[], count: number): string {
  let left = Math.max(0, Math.floor(count))
  const typed: string[] = []
  for (const [i, line] of lines.entries()) {
    const chars = Array.from(line.text)
    if (left < chars.length || i === lines.length - 1) {
      typed.push(chars.slice(0, left).join(''))
      return typed.join('\n')
    }
    left -= chars.length
    typed.push(line.text)
  }
  return typed.join('\n')
}

/** One stretch of a text node's animation (s from its start): `line` a line typing, `hold`
 *  a line's hold after it, `pause` the whole text held before deleting, `delete` the
 *  deleting. */
export interface TextSegment {
  kind: 'line' | 'hold' | 'pause' | 'delete'
  /** The line's index, for `line` and `hold`. */
  index?: number
  start: number
  end: number
}

/** The animation's stretches, in order: each line typing (at its speed) and its hold, then,
 *  with backspace on, the pause and the deleting. */
export function textSegments(params: TextParams): TextSegment[] {
  const out: TextSegment[] = []
  let time = 0
  timedLines(params).forEach((line, index) => {
    const end = time + Array.from(line.text).length / line.speed
    out.push({ kind: 'line', index, start: time, end })
    time = end
    const hold = lineHold(line)
    if (hold) {
      out.push({ kind: 'hold', index, start: time, end: time + hold })
      time += hold
    }
  })
  const backspace = params.backspace
  if (backspace?.enabled) {
    out.push({ kind: 'pause', start: time, end: time + backspace.pause })
    time += backspace.pause
    out.push({
      kind: 'delete',
      start: time,
      end: time + characterCount(params.lines) / backspace.speed,
    })
  }
  return out
}

/** How long the whole animation takes (s). */
export function textDuration(params: TextParams): number {
  return textSegments(params).at(-1)?.end ?? 0
}

/** The text `elapsed` seconds into the animation: typing, the whole text, then (backspace
 *  on) deleting down to nothing. Before the start nothing is typed; after the end it holds
 *  its last state (the whole text, or nothing once deleted). */
export function textAt(params: TextParams, elapsed: number): string {
  const lines = timedLines(params)
  const typed = typedText(lines, elapsed)
  if (typed !== null) return typed
  const whole = textOf(params.lines)
  const backspace = params.backspace
  if (!backspace?.enabled) return whole
  const deleting = elapsed - typingDuration(lines) - backspace.pause
  if (deleting <= 0) return whole
  const count = characterCount(params.lines) - Math.floor(deleting * backspace.speed + 1e-9)
  return prefixText(params.lines, count)
}

// --- The mask: while the text types, only the trophy's band from the first line down shows;
// the top (where there's no text) shows over the last characters.

/** Characters over which the trophy's top shows (it's whole one character before the end,
 *  as in the reference: half at "20" of "2027", whole at "202"). */
export const MASK_REVEAL_CHARACTERS = 3

/** How much of the trophy's top shows (0–1) with `typed` of `total` characters typed: none
 *  until the last MASK_REVEAL_CHARACTERS, then in even steps, whole a character before the
 *  end (deleting, it goes again with the first characters). */
export function maskReveal(typed: number, total: number): number {
  if (total <= 0) return 1
  const start = total - MASK_REVEAL_CHARACTERS
  const steps = Math.max(1, MASK_REVEAL_CHARACTERS - 1)
  return clamp((typed - start) / steps, 0, 1)
}

/** A masked text node's typing: characters typed of all of them (all of them unless it's a
 *  typing preview). Null when it doesn't mask. */
export function textMask(params: TextParams): { typed: number; total: number } | null {
  if (!params.mask) return null
  if (params.progress) return { typed: params.progress.typed, total: params.progress.total }
  const total = characterCount(params.lines)
  return { typed: total, total }
}

/** Preview params showing `typed` text of `params` at `time` (s into its animation): its
 *  lines, with the progress the mask and animated properties need. */
export function typedParams(params: TextParams, typed: string, time: number): TextParams {
  return {
    ...params,
    lines: linesFromText(typed, params.lines),
    progress: {
      typed: Array.from(typed.replace(/\n/g, '')).length,
      total: characterCount(params.lines),
      time,
      lines: textSegments(params).flatMap((segment) => {
        if (segment.kind !== 'line') return []
        const line = timedLines(params)[segment.index ?? 0]
        // The first letter appears one character's time in (an empty line: at its start).
        const first =
          line && line.text && line.speed > 0
            ? Math.min(segment.end, segment.start + 1 / line.speed)
            : segment.start
        return [{ start: segment.start, end: segment.end, first }]
      }),
      ...(params.backspace?.enabled ? { deletes: deleteWindows(params) } : {}),
    },
  }
}

/** When each line is deleted (s), backspace on: characters go from the end at its speed,
 *  so a line's window starts once every later line is gone. */
export function deleteWindows(params: TextParams): { start: number; end: number }[] {
  const start = textSegments(params).find((segment) => segment.kind === 'delete')?.start
  const speed = params.backspace?.speed ?? 0
  if (start === undefined || !(speed > 0)) return []
  const counts = params.lines.map((line) => Array.from(line.text).length)
  let after = 0
  const out = counts.map(() => ({ start: 0, end: 0 }))
  for (let i = counts.length - 1; i >= 0; i--) {
    out[i] = { start: start + after / speed, end: start + (after + counts[i]!) / speed }
    after += counts[i]!
  }
  return out
}

/**
 * Where a masked trophy starts showing (y, artboard px), or null when all of it shows. While
 * typing: from the first line's box top (`bandTop`) down; over the last characters its top
 * edge eases (smoothstep) up to the shape's top (`shapeTop`). Nothing typed: none of it
 * (`frameHeight`).
 */
export function maskTop(
  mask: { typed: number; total: number },
  bandTop: number,
  shapeTop: number,
  frameHeight: number,
): number | null {
  if (mask.typed <= 0) return frameHeight
  const reveal = maskReveal(mask.typed, mask.total)
  if (reveal >= 1) return null
  const eased = reveal * reveal * (3 - 2 * reveal)
  return bandTop + (shapeTop - bandTop) * eased
}
