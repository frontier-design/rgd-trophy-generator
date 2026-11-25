import { createContext, useContext } from 'react'

/** A keyframe as a slider's timeline shows it. */
export interface FieldKeyframe {
  /** Seconds on the animation clock. */
  time: number
  value: number
  /** How the value moves on to the next keyframe (absent: the first of `easings`). */
  easing?: string
}

/** Keyframe animation controls for sliders that name their property (`RangeField` `param`):
 *  given on node cards, absent elsewhere (scene panels show plain sliders). */
export interface FieldAnimControls {
  /** A property's keyframes, in time order (none: it doesn't animate). */
  keyframes(param: string): readonly FieldKeyframe[]
  /** A keyframe at the clock's time with `value` (that one changed if there is one). */
  addKeyframe(param: string, value: number): void
  removeKeyframe(param: string, index: number): void
  /** Moves keyframe `index` to `time` (s); returns where it is now in time order. */
  moveKeyframe(param: string, index: number, time: number): number
  setEasing(param: string, index: number, easing: string): void
  /** The easings to choose from: value and label, the first the default. */
  easings: readonly { value: string; label: string }[]
}

export const FieldAnimContext = createContext<FieldAnimControls | null>(null)

export const useFieldAnim = () => useContext(FieldAnimContext)
