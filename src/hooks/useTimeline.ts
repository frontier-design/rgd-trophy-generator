import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  changedLeaves,
  fromTimelineValues,
  getTimeline,
  leafAt,
  toTimelineValues,
  type ParamPath,
  type Timeline,
} from '../timeline'
import type { AnimatedParams, KeyframeControl } from '../types'

export interface TimelineHandle {
  timeline: Timeline
  /** Playhead (s), whether it's playing, and the sequence's length (s). */
  position: number
  playing: boolean
  length: number
  /** A sidebar edit: applied at once and pushed to the timeline (a keyframe at the
   *  playhead for animated params). */
  edit: (patch: Partial<AnimatedParams>) => void
  /** Like `edit`, but `paths` become static (any keyframes dropped): for presets. */
  editStatic: (patch: Partial<AnimatedParams>, paths: readonly ParamPath[]) => void
  /** The keyframe button for a param. */
  keyframe: (path: ParamPath) => KeyframeControl
  /** Apply the timeline's values at the playhead now (video export steps with this). */
  syncNow: () => void
}

/**
 * Connects the app's parameters to the Theatre.js timeline. The app keeps its own state:
 * sidebar edits go through `edit` (state + timeline), and the timeline's values at the
 * playhead (scrubbing, playback, Theatre's own editors) are applied with `apply`.
 */
export function useTimeline(
  params: AnimatedParams,
  apply: (params: AnimatedParams) => void,
): TimelineHandle {
  // Created once, with the app's defaults (the first params) as the props' defaults. Theatre
  // then restores any saved animation and overrides from the browser's storage.
  const [timeline] = useState(() => getTimeline(toTimelineValues(params)))
  const [position, setPosition] = useState(() => timeline.position)
  const [playing, setPlaying] = useState(() => timeline.playing)
  const [length, setLength] = useState(() => timeline.length)
  // Bumped when keyframes change, so the keyframe buttons re-render.
  const [, setKeyframesVersion] = useState(0)

  const paramsRef = useRef(params)
  useEffect(() => {
    paramsRef.current = params
  })

  const syncNow = useCallback(() => {
    const current = paramsRef.current
    const next = fromTimelineValues(timeline.values(), current)
    // Skip no-op updates (Theatre reports every value, changed or not).
    if (changedLeaves(toTimelineValues(current), toTimelineValues(next)).length === 0) return
    paramsRef.current = next
    apply(next)
  }, [timeline, apply])

  useEffect(() => {
    syncNow()
    // Theatre's later updates are applied synchronously, inside its frame, so the text, the
    // shape and the solid all update before that frame paints. (Not the call Theatre makes
    // while subscribing, which is inside this effect, where React can't flush.)
    let subscribed = false
    const stops = [
      timeline.onValues(() => (subscribed ? flushSync(syncNow) : syncNow())),
      timeline.onPosition(setPosition),
      timeline.onPlaying(setPlaying),
      timeline.onLength(setLength),
      timeline.onKeyframes(() => setKeyframesVersion((v) => v + 1)),
    ]
    subscribed = true
    // Studio's overlay belongs to the generator: shown while it's mounted, hidden when
    // another page (e.g. the canvas) replaces it.
    timeline.setStudioVisible(true)
    // Apply the saved project as soon as it's loaded, rather than on Theatre's next frame
    // (which a background tab may not run before the first edit or preset).
    let active = true
    void timeline.ready.then(() => {
      if (active) syncNow()
    })
    return () => {
      active = false
      stops.forEach((stop) => stop())
      timeline.setStudioVisible(false)
    }
  }, [timeline, syncNow])

  const edit = (patch: Partial<AnimatedParams>) => {
    const next = { ...params, ...patch }
    timeline.set(changedLeaves(toTimelineValues(params), toTimelineValues(next)))
    paramsRef.current = next
    apply(next)
  }

  const editStatic = (patch: Partial<AnimatedParams>, paths: readonly ParamPath[]) => {
    const next = { ...params, ...patch }
    const values = toTimelineValues(next)
    timeline.setStatic(paths.map((path) => [path, leafAt(values, path)] as const))
    paramsRef.current = next
    apply(next)
  }

  const keyframe = (path: ParamPath): KeyframeControl => ({
    state: timeline.keyframeState(path),
    onToggle: () => {
      timeline.toggleKeyframe(path)
      setKeyframesVersion((v) => v + 1)
    },
  })

  return { timeline, position, playing, length, edit, editStatic, keyframe, syncNow }
}
