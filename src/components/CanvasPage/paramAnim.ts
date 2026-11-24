/**
 * Per-node property animation: a modifier node's slider can animate from one value to
 * another across one text line's typing (the text node linked into the same scene): from at
 * the line's first character, to once it's typed, eased in and out. Pure (no React).
 */

/** One animated property of a node. */
export interface ParamAnim {
  enabled: boolean
  /** The text line (1-based) whose typing it follows. */
  line: number
  from: number
  to: number
  /** Which value the node's slider edits (and the scene shows at rest). */
  editing: 'from' | 'to'
  /** How it moves from `from` to `to` (absent in saves from before easings: `ease`). */
  easing?: Easing
}

/** Easings: `ease` in and out (smoothstep), `linear`, `fast-out` (most of the change at the
 *  start, then settling) and `fast-in-out` (a quick, sharp move in the middle), both
 *  exponential; `hold` jumps to `to` when the line's first letter appears (and back to
 *  `from` once backspace has deleted all of it). */
export const EASINGS = ['ease', 'linear', 'fast-out', 'fast-in-out', 'hold'] as const
export type Easing = (typeof EASINGS)[number]
export const DEFAULT_EASING: Easing = 'ease'

/** A node's animated properties, by path (`flutes`, or `lineBox.padX` inside an object). */
export type ParamAnims = Readonly<Record<string, ParamAnim>>

/** Where the text animation is, for a scene: seconds in, and each line's typing (s). Null:
 *  at rest (not playing, scrubbed or rendering). */
export interface TextTiming {
  time: number
  /** Each line's typing (s), and when its first letter appears (`hold` switches then). */
  lines: readonly { start: number; end: number; first?: number }[]
  /** With backspace on: when each line is deleted (s). */
  deletes?: readonly { start: number; end: number }[]
}

/** A new animation for a property at `value`: from and to both it, following line 1,
 *  editing to. */
export function startAnim(value: number): ParamAnim {
  return { enabled: true, line: 1, from: value, to: value, editing: 'to' }
}

/** The value at a path (`a` or `a.b`), if it's a number. */
export function valueAt(params: object, path: string): number | undefined {
  let value: unknown = params
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** `params` with the value at `path` replaced (objects along it copied). */
export function withValueAt<T extends object>(params: T, path: string, value: number): T {
  const [key, ...rest] = path.split('.')
  if (!key) return params
  const record = params as Record<string, unknown>
  const next = rest.length
    ? withValueAt((record[key] ?? {}) as object, rest.join('.'), value)
    : value
  return { ...params, [key]: next } as T
}

/** Progress (0–1 over the line) eased (0–1). */
export function ease(easing: Easing, t: number): number {
  switch (easing) {
    case 'linear':
      return t
    case 'fast-out':
      return t >= 1 ? 1 : 1 - 2 ** (-10 * t)
    case 'fast-in-out':
      if (t <= 0) return 0
      if (t >= 1) return 1
      return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2
    case 'hold':
      return t >= 1 ? 1 : 0
    default:
      return t * t * (3 - 2 * t)
  }
}

/** How far `time` is through `window` (0–1); a zero-length window is a step at its start. */
function through(window: { start: number; end: number }, time: number): number {
  const length = window.end - window.start
  if (length > 0) return Math.min(1, Math.max(0, (time - window.start) / length))
  return time >= window.start ? 1 : 0
}

/** An animation's value: interpolated over its line's typing when there's timing (from
 *  before the line starts, to after it's typed), and back again while backspace deletes the
 *  line (the typing played backwards: to → from as its characters go); else, at rest, the
 *  value its slider edits. */
export function animValue(anim: ParamAnim, timing: TextTiming | null): number {
  if (!timing) return anim.editing === 'from' ? anim.from : anim.to
  const window = timing.lines[anim.line - 1]
  if (!window) return anim.to
  const deleting = timing.deletes?.[anim.line - 1]
  // Hold: to from the moment the line's first letter appears until its last letter is
  // deleted (while any of the line is on screen); from otherwise. No easing.
  if ((anim.easing ?? DEFAULT_EASING) === 'hold') {
    const time = timing.time + 1e-9
    if (deleting && time >= deleting.start) return time >= deleting.end ? anim.from : anim.to
    return time >= (window.first ?? window.end) ? anim.to : anim.from
  }
  const share =
    deleting && timing.time >= deleting.start
      ? 1 - through(deleting, timing.time)
      : through(window, timing.time)
  return anim.from + (anim.to - anim.from) * ease(anim.easing ?? DEFAULT_EASING, share)
}

/** Whether any of a node's properties animate. */
export function animates(anims: ParamAnims | undefined): boolean {
  return Boolean(anims && Object.values(anims).some((anim) => anim.enabled))
}

/** `params` with each animated property at its value now; the same object when nothing
 *  animates. */
export function animatedParams<T extends object>(
  params: T,
  anims: ParamAnims | undefined,
  timing: TextTiming | null,
): T {
  if (!anims || !animates(anims)) return params
  let out = params
  for (const [path, anim] of Object.entries(anims)) {
    if (!anim.enabled || valueAt(params, path) === undefined) continue
    out = withValueAt(out, path, animValue(anim, timing))
  }
  return out
}

/** `params` as a node's sliders show them: each animated property at the value its slider
 *  edits (from or to). */
export function shownParams<T extends object>(params: T, anims: ParamAnims | undefined): T {
  return animatedParams(params, anims, null)
}

/**
 * A slider edit (`patch`, made against `shown`) split into what goes to the params and to
 * the animations: an animated property's new value goes to the value its slider edits, and
 * the node's own value (`params`, what it has with the animation off) stays.
 */
export function routeEdit(
  params: object,
  shown: object,
  patch: Record<string, unknown>,
  anims: ParamAnims | undefined,
): { params: Record<string, unknown>; anims: ParamAnims | undefined } {
  if (!anims || !animates(anims)) return { params: patch, anims }
  let out: Record<string, unknown> = { ...patch }
  let next: Record<string, ParamAnim> | undefined
  for (const [path, anim] of Object.entries(anims)) {
    if (!anim.enabled) continue
    const [key] = path.split('.')
    if (!key || !(key in out)) continue
    const value = valueAt(out, path)
    if (value !== undefined && value !== valueAt(shown, path)) {
      next ??= { ...anims }
      next[path] = { ...anim, [anim.editing]: value }
    }
    // Whether or not it changed (a nested edit carries its siblings' shown values along),
    // the node keeps its own value.
    const own = valueAt(params, path)
    if (!path.includes('.')) delete out[key]
    else if (own !== undefined) out = withValueAt(out, path, own)
  }
  return { params: out, anims: next ?? anims }
}

/** Saved animations, checked (broken entries dropped). */
export function parseAnims(value: unknown): ParamAnims | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, ParamAnim> = {}
  for (const [path, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const anim = raw as Record<string, unknown>
    const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const from = number(anim.from)
    const to = number(anim.to)
    if (from === null || to === null) continue
    out[path] = {
      enabled: anim.enabled === true,
      line: Math.max(1, Math.round(number(anim.line) ?? 1)),
      from,
      to,
      editing: anim.editing === 'from' ? 'from' : 'to',
      ...(EASINGS.includes(anim.easing as Easing) && anim.easing !== DEFAULT_EASING
        ? { easing: anim.easing as Easing }
        : {}),
    }
  }
  return Object.keys(out).length ? out : undefined
}
