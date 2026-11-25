import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

/**
 * The canvas's animation clock: one time (s) every animated node property is shown at. A
 * node's keyframe timeline scrubs and plays it; a record node moves it while scrubbing,
 * playing and rendering. It stays where it was left (0 at first).
 */
export interface AnimationClock {
  get(): number
  set(time: number): void
  playing(): boolean
  /** Play from now on (from 0 when at or past `until`), stopping at `until` (s). */
  play(until: number): void
  pause(): void
  subscribe(listener: () => void): () => void
}

export function createAnimationClock(): AnimationClock {
  let time = 0
  let frame: number | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }
  return {
    get: () => time,
    set(next) {
      const value = Math.max(0, next)
      if (value === time) return
      time = value
      notify()
    },
    playing: () => frame !== null,
    play(until) {
      stop()
      if (time >= until - 1e-3) time = 0
      const from = performance.now() - time * 1000
      const tick = () => {
        time = Math.min(until, (performance.now() - from) / 1000)
        if (time >= until) {
          frame = null
          notify()
          return
        }
        notify()
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
      notify()
    },
    pause() {
      if (frame === null) return
      stop()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const AnimationClockContext = createContext<AnimationClock | null>(null)

export const useAnimationClock = () => useContext(AnimationClockContext)

/** The clock's time (s); 0 (and no re-render as it moves) when `enabled` is false, so only
 *  what animates follows it. */
export function useClockTime(enabled = true): number {
  return useClockTimeOf(useAnimationClock(), enabled)
}

/** `useClockTime` for a given clock (its owner, outside its own provider). */
export function useClockTimeOf(clock: AnimationClock | null, enabled = true): number {
  const subscribe = useCallback(
    (listener: () => void) => clock?.subscribe(listener) ?? (() => {}),
    [clock],
  )
  return useSyncExternalStore(
    subscribe,
    () => (enabled && clock ? clock.get() : 0),
    () => 0,
  )
}

/** Whether the clock is playing. */
export function useClockPlaying(): boolean {
  const clock = useAnimationClock()
  const subscribe = useCallback(
    (listener: () => void) => clock?.subscribe(listener) ?? (() => {}),
    [clock],
  )
  return useSyncExternalStore(
    subscribe,
    () => clock?.playing() ?? false,
    () => false,
  )
}
