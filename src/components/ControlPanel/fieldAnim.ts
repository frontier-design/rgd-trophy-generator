import { createContext, useContext } from 'react'

/** A slider's animation, as its controls show it. */
export interface FieldAnimState {
  enabled: boolean
  /** The text line (1-based) whose typing it follows. */
  line: number
  /** Which value the slider edits. */
  editing: 'from' | 'to'
  /** How it moves from one to the other (absent: the default, the first of `easings`). */
  easing?: string
}

/** Animation controls for sliders that name their property (`RangeField` `param`): given on
 *  node cards, absent elsewhere (scene panels show plain sliders). */
export interface FieldAnimControls {
  get(param: string): FieldAnimState | undefined
  /** Turn the animation on (from and to start at the slider's value) or off. */
  setEnabled(param: string, enabled: boolean, value: number): void
  setLine(param: string, line: number): void
  setEditing(param: string, editing: 'from' | 'to'): void
  /** The easings to choose from: value and label, the first the default. */
  easings: readonly { value: string; label: string }[]
  setEasing(param: string, easing: string): void
}

export const FieldAnimContext = createContext<FieldAnimControls | null>(null)

export const useFieldAnim = () => useContext(FieldAnimContext)
