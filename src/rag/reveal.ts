// Pure math only: no library imports allowed in rag/ (enforced by ESLint).
import type { LineBox, LineMeasure } from '../types'
import { lineBoxes, type LineBoxOptions } from './lineBoxes'

/** One item in a staggered reveal. */
export interface StaggeredItem {
  /** Whether it has appeared yet. */
  shown: boolean
  /** How far into place it has eased: 0 on appearing, 1 settled (ease-out). */
  settle: number
}

/** Ease-out for settling: fast first, landing gently. Fitted to the RGD reference. */
const SETTLE_EXPONENT = 2.5

/**
 * `count` items appearing one after another at `progress` (0–1), in order (item 0 first):
 * each settles over one unit of time, the next starting `stagger` of that later, so the
 * whole runs (count − 1) × stagger + 1 units. Shared by the text's stack-in and the banner,
 * so they move with the same timing and easing. At 0 nothing is shown; at 1 all settled.
 */
export function staggered(count: number, progress: number, stagger: number): StaggeredItem[] {
  const interval = Math.max(0, stagger)
  const total = Math.max(0, count - 1) * interval + 1
  const p = Math.min(1, Math.max(0, progress))
  const time = p * total
  return Array.from({ length: count }, (_, i) => {
    const start = i * interval
    const shown = p >= 1 || time > start
    const linear = shown ? Math.min(1, Math.max(0, time - start)) : 0
    return { shown, settle: 1 - (1 - linear) ** SETTLE_EXPONENT }
  })
}

/** One line's state during a reveal. */
export interface LineReveal {
  /** Whether the line (or any of its letters) has appeared yet. */
  shown: boolean
  /** The whole line's horizontal offset from its place (px; negative = left). Eases to 0. */
  offset: number
  /** How far into place it has eased (0–1), for anything that grows in with it (for the
   *  type reveal: its first letter's). */
  settle: number
  /** Type reveal only: each character (code point) of the line's visible text, whether
   *  it's shown and its offset from its place (px, the spacing still closing up). */
  letters?: { shown: boolean[]; offsets: number[] }
  /** Type reveal only: how far the shown letters reach, from the line's left (px). */
  extent?: number
}

export interface StackRevealOptions {
  /** Time between one line appearing and the next, as a share of a line's slide time. */
  stagger: number
  /** How far left a line appears (px), before sliding into place. */
  slide: number
  /** Which line comes first: the bottom one (default, the RGD reference) or the top one. */
  from?: 'bottom' | 'top'
}

/**
 * The stack-in reveal at `reveal` (0–1): lines appear one by one from the bottom up (or,
 * `from: 'top'`, the top down), each
 * all at once and `slide` px to the left, then ease right into place. The next line
 * appears `stagger` of a slide later, so the earlier lines are always further along. At 0
 * nothing is shown; at 1 every line is in place.
 */
export function stackReveal(
  lineCount: number,
  reveal: number,
  { stagger, slide, from = 'bottom' }: StackRevealOptions,
): LineReveal[] {
  // Items come in order; line i is item i from the top, or counted from the bottom.
  const items = staggered(lineCount, reveal, stagger)
  if (from === 'bottom') items.reverse()
  return items.map(({ shown, settle }) => ({
    shown,
    // (0 once settled, not -0.)
    offset: shown && settle < 1 ? -slide * (1 - settle) : 0,
    settle,
  }))
}

/**
 * How far a trophy filled out to the frame still is at `reveal` (0–1): 1 at the start, 0
 * once every line is in place, easing in and out (smootherstep), so it leaves the full
 * frame from rest and lands as the last line settles.
 */
export function revealFill(reveal: number): number {
  const t = Math.min(1, Math.max(0, reveal))
  return 1 - t * t * t * (t * (6 * t - 15) + 10)
}

/** A line to type in: its visible text, and the widths of its prefixes (k characters,
 *  k = 0…length; measure/measurePrefixWidths). */
export interface TypeLine {
  text: string
  prefixWidths: number[]
}

export interface TypeRevealOptions {
  /** Time between one letter appearing and the next, as a share of a letter's settle time. */
  stagger: number
  /** Extra space a letter arrives with (px), closing up as it settles. */
  spacing: number
  /** 0 = letters in reading order; 1 = each line's letters in a scattered order. */
  scatter: number
  /** Which line is typed first: the bottom one or the top one (default). */
  from?: 'bottom' | 'top'
}

/** A stable pseudo-random 0–1 per (line, character), for the scattered order. */
function scatterKey(line: number, char: number): number {
  const x = Math.sin(line * 12.9898 + char * 78.233 + 0.5) * 43758.5453
  return x - Math.floor(x)
}

/**
 * The type reveal at `reveal` (0–1): letters appear one at a time at their places, top line
 * first (or, `from: 'bottom'`, bottom line first), in reading order or (with `scatter`) in a scattered order within each line. Each
 * arrives with `spacing` px of extra space before it that closes up as it settles (the
 * stack-in's ease-out), pushing the letters after it along, so the line's tracking tightens
 * as it fills. Spaces aren't typed (they're blank anyway). At 1 every letter is in place.
 */
export function typeReveal(
  lines: TypeLine[],
  reveal: number,
  { stagger, spacing, scatter, from = 'top' }: TypeRevealOptions,
): LineReveal[] {
  const chars = lines.map((line) => Array.from(line.text))
  // The letters in typing order: line by line from the top or the bottom, and within a line
  // in reading order or scattered.
  const order: Array<{ line: number; char: number }> = []
  const lineOrder = chars.map((_, l) => l)
  if (from === 'bottom') lineOrder.reverse()
  lineOrder.forEach((l) => {
    const lineChars = chars[l] ?? []
    lineChars
      .map((c, i) => ({ i, key: i + scatter * lineChars.length * scatterKey(l, i), c }))
      .filter(({ c }) => c.trim() !== '')
      .sort((a, b) => a.key - b.key)
      .forEach(({ i }) => order.push({ line: l, char: i }))
  })
  const items = staggered(order.length, reveal, stagger)
  const state = chars.map((lineChars) => lineChars.map(() => ({ shown: false, settle: 0 })))
  order.forEach(({ line, char }, k) => {
    const item = items[k]
    const slot = state[line]?.[char]
    if (item && slot) Object.assign(slot, item)
  })

  return lines.map((line, l) => {
    const letters = state[l] ?? []
    const shown: boolean[] = []
    const offsets: number[] = []
    let push = 0
    let extent = 0
    let settle = 0
    letters.forEach((letter, i) => {
      if (letter.shown) {
        // This letter's spacing, and every unsettled one before it, push it along.
        push += spacing * (1 - letter.settle)
        extent = Math.max(extent, (line.prefixWidths[i + 1] ?? 0) + push)
        settle = Math.max(settle, letter.settle)
      }
      shown.push(letter.shown)
      offsets.push(push)
    })
    const any = shown.some(Boolean)
    return { shown: any, offset: 0, settle, letters: { shown, offsets }, extent }
  })
}

/**
 * The boxes that carve the shape during the reveal: only shown lines. Stack-in: each moved
 * with its line, so its groove deepens as the line slides in. Type: as wide as the typed
 * letters reach, padding growing in with the first letter, so the groove grows letter by
 * letter.
 */
export function revealedBoxes(
  lines: LineMeasure[],
  reveals: LineReveal[],
  options: LineBoxOptions,
): LineBox[] {
  return lines.flatMap((line, i) => {
    const reveal = reveals[i]
    if (!reveal?.shown) return []
    const typed = reveal.extent !== undefined
    const width = typed ? (reveal.extent ?? 0) : line.width
    const padX = typed ? options.padX * reveal.settle : options.padX
    return lineBoxes([{ ...line, width }], { ...options, padX }).map((box) => ({
      ...box,
      x: box.x + reveal.offset,
    }))
  })
}
