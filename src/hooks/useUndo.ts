import { useCallback, useEffect, useRef } from 'react'

/** Changes settle this long (ms, with no pointer pressed) before they become one undo step,
 *  so a slider drag or a node's move is one step, not one per frame. */
const SETTLE = 300
/** At most this many steps back. */
const LIMIT = 100

/** Two states are the same when each of their fields is (the same arrays, by reference). */
function same<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as Array<keyof T>).every((key) => a[key] === b[key])
}

export interface UndoHistory {
  /** Back one step (any change still settling first becomes a step of its own). */
  undo(): void
  /** Forward one step, after an undo. */
  redo(): void
  /** End a transaction immediately, separating it from adjacent changes. */
  checkpoint(): void
}

/**
 * Undo and redo over a state made of a few immutable fields (e.g. the canvas's scenes,
 * nodes and links): records it once each change has settled (SETTLE ms, no pointer
 * pressed), and puts a recorded state back with `restore`. A new change after undoing
 * drops the steps that were undone.
 */
export function useUndo<T extends object>(state: T, restore: (state: T) => void): UndoHistory {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  /** The last recorded state (what an undo returns to once later changes are recorded). */
  const base = useRef(state)
  const latest = useRef(state)
  const pressed = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const restoreRef = useRef(restore)
  useEffect(() => {
    restoreRef.current = restore
  })

  const record = useCallback(() => {
    clearTimeout(timer.current)
    if (same(latest.current, base.current)) return
    past.current.push(base.current)
    if (past.current.length > LIMIT) past.current.shift()
    future.current = []
    base.current = latest.current
  }, [])

  // A change: recorded once it settles (later, while a pointer is still pressed: a drag).
  useEffect(() => {
    latest.current = state
    if (same(state, base.current)) return
    clearTimeout(timer.current)
    const settle = () => {
      if (pressed.current) timer.current = setTimeout(settle, SETTLE)
      else record()
    }
    timer.current = setTimeout(settle, SETTLE)
  }, [state, record])

  useEffect(() => {
    const down = () => (pressed.current = true)
    const up = () => (pressed.current = false)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      clearTimeout(timer.current)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])

  const go = useCallback(
    (from: { current: T[] }, to: { current: T[] }) => {
      record()
      const next = from.current.pop()
      if (!next) return
      to.current.push(base.current)
      base.current = next
      latest.current = next
      restoreRef.current(next)
    },
    [record],
  )
  const undo = useCallback(() => go(past, future), [go])
  const redo = useCallback(() => go(future, past), [go])
  return { undo, redo, checkpoint: record }
}
