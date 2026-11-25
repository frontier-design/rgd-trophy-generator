/**
 * Per-node property animation: a modifier node's slider can animate over time, by keyframes
 * in seconds on the canvas's animation clock (scrubbed and played from a node's timeline, or
 * a record node's; rendered frame by frame by a record node). Each keyframe holds a value;
 * between two, the value moves by the earlier one's easing. Before the first keyframe the
 * value is the first's, after the last the last's. Pure (no React).
 */

/** One keyframe: a value at a time (s), and how the value moves on to the next keyframe. */
export interface Keyframe {
  time: number
  value: number
  /** Absent: `ease`. */
  easing?: Easing
}

/** One animated property: its keyframes, in time order. */
export interface ParamTrack {
  keyframes: readonly Keyframe[]
}

/** Easings: `ease` in and out (smoothstep), `linear`, `fast-out` (most of the change at the
 *  start, then settling) and `fast-in-out` (a quick, sharp move in the middle), both
 *  exponential; `hold` keeps the value until the next keyframe, then jumps. */
export const EASINGS = ['ease', 'linear', 'fast-out', 'fast-in-out', 'hold'] as const
export type Easing = (typeof EASINGS)[number]
export const DEFAULT_EASING: Easing = 'ease'

/** A node's animated properties, by path (`flutes`, or `lineBox.padX` inside an object). */
export type ParamAnims = Readonly<Record<string, ParamTrack>>

/** Keyframes closer than this (s) are the same moment: an edit there changes that one. */
export const KEYFRAME_EPSILON = 1e-3

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

/** Progress (0–1 between two keyframes) eased (0–1). */
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

/** A track's value at `time` (s); undefined with no keyframes. */
export function trackValue(track: ParamTrack | undefined, time: number): number | undefined {
  const keys = track?.keyframes
  if (!keys?.length) return undefined
  const first = keys[0]!
  if (time <= first.time) return first.value
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!
    const b = keys[i + 1]!
    if (time < b.time) {
      const span = b.time - a.time
      const t = span > 0 ? (time - a.time) / span : 1
      return a.value + (b.value - a.value) * ease(a.easing ?? DEFAULT_EASING, t)
    }
  }
  return keys[keys.length - 1]!.value
}

/** Whether a property animates (it has a keyframe). */
export function animated(track: ParamTrack | undefined): boolean {
  return Boolean(track?.keyframes.length)
}

/** Whether any of a node's properties animate. */
export function animates(anims: ParamAnims | undefined): boolean {
  return Boolean(anims && Object.values(anims).some(animated))
}

/** `params` with each animated property at its value at `time`; the same object when
 *  nothing animates. */
export function animatedParams<T extends object>(
  params: T,
  anims: ParamAnims | undefined,
  time: number,
): T {
  if (!anims || !animates(anims)) return params
  let out = params
  for (const [path, track] of Object.entries(anims)) {
    const value = trackValue(track, time)
    if (value === undefined || valueAt(params, path) === undefined) continue
    out = withValueAt(out, path, value)
  }
  return out
}

/** The index of the keyframe at `time` (within KEYFRAME_EPSILON), or -1. */
export function keyframeAt(track: ParamTrack | undefined, time: number): number {
  return track?.keyframes.findIndex((key) => Math.abs(key.time - time) < KEYFRAME_EPSILON) ?? -1
}

const sorted = (keys: Keyframe[]) => keys.sort((a, b) => a.time - b.time)

/** The track with `value` at `time`: that keyframe changed if there is one, else a new one
 *  (easing like the one before it). */
export function setKeyframe(
  track: ParamTrack | undefined,
  time: number,
  value: number,
): ParamTrack {
  const keys = [...(track?.keyframes ?? [])]
  const at = keyframeAt(track, time)
  if (at >= 0) keys[at] = { ...keys[at]!, value }
  else keys.push({ time: Math.max(0, time), value })
  return { keyframes: sorted(keys) }
}

/** The track without keyframe `index`. */
export function removeKeyframe(track: ParamTrack, index: number): ParamTrack {
  return { keyframes: track.keyframes.filter((_, i) => i !== index) }
}

/**
 * The track with keyframe `index` moved to `time` (s, never before 0), and where it now is
 * in time order. Moved onto another keyframe's moment, it stays a hair after it.
 */
export function moveKeyframe(
  track: ParamTrack,
  index: number,
  time: number,
): { track: ParamTrack; index: number } {
  const key = track.keyframes[index]
  if (!key) return { track, index }
  const moved = { ...key, time: Math.max(0, time) }
  const keys = track.keyframes.filter((_, i) => i !== index)
  if (keys.some((other) => Math.abs(other.time - moved.time) < KEYFRAME_EPSILON))
    moved.time += KEYFRAME_EPSILON * 1.5
  keys.push(moved)
  sorted(keys)
  return { track: { keyframes: keys }, index: keys.indexOf(moved) }
}

/** The track with keyframe `index`'s easing (how it moves on to the next) set. */
export function setKeyframeEasing(track: ParamTrack, index: number, easing: Easing): ParamTrack {
  return {
    keyframes: track.keyframes.map((key, i) => {
      if (i !== index) return key
      const { easing: _, ...rest } = key
      return easing === DEFAULT_EASING ? rest : { ...rest, easing }
    }),
  }
}

/**
 * A slider edit (`patch`, made against `shown`, the params at `time`) split into what goes
 * to the params and to the animations: an animated property's new value becomes a keyframe
 * at `time` (that keyframe changed if there is one), and the node's own value (`params`,
 * what it has without the animation) stays.
 */
export function routeEdit(
  params: object,
  shown: object,
  patch: Record<string, unknown>,
  anims: ParamAnims | undefined,
  time: number,
): { params: Record<string, unknown>; anims: ParamAnims | undefined } {
  if (!anims || !animates(anims)) return { params: patch, anims }
  let out: Record<string, unknown> = { ...patch }
  let next: Record<string, ParamTrack> | undefined
  for (const [path, track] of Object.entries(anims)) {
    if (!animated(track)) continue
    const [key] = path.split('.')
    if (!key || !(key in out)) continue
    const value = valueAt(out, path)
    if (value !== undefined && value !== valueAt(shown, path)) {
      next ??= { ...anims }
      next[path] = setKeyframe(track, time, value)
    }
    // Whether or not it changed (a nested edit carries its siblings' shown values along),
    // the node keeps its own value.
    const own = valueAt(params, path)
    if (!path.includes('.')) delete out[key]
    else if (own !== undefined) out = withValueAt(out, path, own)
  }
  return { params: out, anims: next ?? anims }
}

/** Saved animations, checked: tracks of keyframes (time order restored, broken ones
 *  dropped). Animations saved before keyframes (a line's typing, from and to) are dropped. */
export function parseAnims(value: unknown): ParamAnims | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, ParamTrack> = {}
  const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  for (const [path, raw] of Object.entries(value as Record<string, unknown>)) {
    const keys = (raw as { keyframes?: unknown } | null)?.keyframes
    if (!Array.isArray(keys)) continue
    const keyframes = keys.flatMap((entry): Keyframe[] => {
      if (!entry || typeof entry !== 'object') return []
      const key = entry as Record<string, unknown>
      const time = number(key.time)
      const v = number(key.value)
      if (time === null || v === null) return []
      return [
        {
          time: Math.max(0, time),
          value: v,
          ...(EASINGS.includes(key.easing as Easing) && key.easing !== DEFAULT_EASING
            ? { easing: key.easing as Easing }
            : {}),
        },
      ]
    })
    if (keyframes.length) out[path] = { keyframes: sorted(keyframes) }
  }
  return Object.keys(out).length ? out : undefined
}
