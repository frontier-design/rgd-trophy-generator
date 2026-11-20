import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import {
  getSaveStatus,
  registerFlush,
  subscribeSaveStatus,
  writeSaved,
  type SaveSlot,
  type SaveStatus,
} from '../state/persist'

/** How long after the last change an autosave waits (ms), so drags save once they pause. */
const AUTOSAVE_DELAY = 400

/**
 * Autosave `value` (JSON-serializable) to the browser's storage under `slot`: shortly after
 * it changes, and at once when the page is hidden or closed, when the component unmounts
 * (switching pages) and before a manual save. The value it starts with (what was loaded)
 * isn't written back, so merely opening a page never counts as a change.
 */
export function useAutosave<T>(
  slot: SaveSlot,
  value: T,
  {
    delay = AUTOSAVE_DELAY,
    serialize,
  }: {
    delay?: number
    /** What's actually written (e.g. with large parts stored apart); `value` itself by
     *  default. May be async (assets are written before the document refers to them): the
     *  save only completes once it has. Called when saving, not on every change. */
    serialize?: (value: T) => unknown | Promise<unknown>
  } = {},
): void {
  const serializeRef = useRef(serialize)
  useEffect(() => {
    serializeRef.current = serialize
  })
  const latest = useRef(value)
  const initial = useRef(value)
  const dirty = useRef(false)
  // Writes run one after another, so an async asset write can't be overtaken by a later save.
  const writing = useRef<Promise<void>>(Promise.resolve())
  const busy = useRef(false)

  const flush = useCallback(() => {
    if (!dirty.current) return writing.current
    dirty.current = false
    const value = latest.current
    const write = serializeRef.current
    // Nothing async before it and the serialization is synchronous (no image asset to store):
    // write it now, as autosave always has (e.g. leaving the page).
    if (!busy.current) {
      const serialized = write ? write(value) : value
      if (!isThenable(serialized)) {
        writeSaved(slot, serialized)
        return writing.current
      }
      busy.current = true
      const run = Promise.resolve(serialized)
        .then((result) => {
          writeSaved(slot, result)
        })
        .finally(() => {
          busy.current = false
        })
      writing.current = run
      return run
    }
    const run = writing.current.catch(() => {}).then(async () => {
      const serialized = write ? await write(value) : value
      writeSaved(slot, serialized)
    })
    writing.current = run.catch(() => {})
    return run
  }, [slot])

  useEffect(() => {
    latest.current = value
    if (value === initial.current && !dirty.current) return
    dirty.current = true
    const timer = setTimeout(flush, delay)
    return () => clearTimeout(timer)
  }, [value, delay, flush])

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const stop = registerFlush(flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      flush()
      stop()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [flush])
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

/** The save status (last autosave, failures, the project file), re-rendering on change. */
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(subscribeSaveStatus, getSaveStatus)
}
