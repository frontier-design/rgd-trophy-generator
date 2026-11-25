import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useAnimationClock, useClockPlaying, useClockTime } from './animationClock'
import { useFieldAnim } from './fieldAnim'

/** Ruler steps (s): the first leaving at least MIN_TICK px between ticks. */
const STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]
const MIN_TICK = 36
/** The track's width at full card size (px), for spacing the ruler. */
const TRACK_WIDTH = 230
/** How far the view zooms: its span (s). */
const SPAN = { min: 0.25, max: 120 }
/** Dragged keyframes land on this grid (s); Shift: whole tenths. */
const SNAP = 0.01

const seconds = (value: number) => `${value < 10 ? value.toFixed(2) : value.toFixed(1)}s`
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * A slider's keyframes on a timeline, on node cards: a ruler in seconds, the keyframes
 * (yellow diamonds) and the animation clock's playhead. Click or drag the track to scrub;
 * drag a keyframe left or right to retime it (selecting it also moves the playhead to it);
 * scroll pans, ⌘/Ctrl-scroll or a pinch zooms about the pointer. The bar plays the clock,
 * adds (or removes) a keyframe at the playhead with the slider's value, and sets the
 * selected keyframe's easing (how it moves on to the next).
 */
export function KeyframeTimeline({
  label,
  param,
  value,
}: {
  label: string
  param: string
  /** The slider's value now: what a new keyframe holds. */
  value: number
}) {
  const anims = useFieldAnim()
  const clock = useAnimationClock()
  const time = useClockTime()
  const playing = useClockPlaying()
  const track = useRef<HTMLDivElement>(null)
  const keys = anims?.keyframes(param) ?? []
  const last = keys.at(-1)?.time ?? 0
  // A little room before 0, so a keyframe there shows whole.
  const [view, setView] = useState(() => {
    const span = Math.max(4, last * 1.25 + 0.5)
    return { start: -span * 0.04, span }
  })
  const [selected, setSelected] = useState<number | null>(null)
  const drag = useRef<{ pointer: number; index: number } | null>(null)
  const scrubbing = useRef<number | null>(null)
  if (!anims || !clock) return null

  const at = keys.findIndex((key) => Math.abs(key.time - time) < 1e-3)
  const chosen = selected !== null && selected < keys.length ? selected : at >= 0 ? at : null
  const share = (t: number) => `${((t - view.start) / view.span) * 100}%`
  const pxPerSecond = TRACK_WIDTH / view.span
  const step = STEPS.find((s) => s * pxPerSecond >= MIN_TICK) ?? 60
  const firstTick = Math.ceil(view.start / step) * step
  const ticks = Array.from(
    { length: Math.max(0, Math.floor((view.start + view.span - firstTick) / step + 1e-9) + 1) },
    (_, i) => +(firstTick + i * step).toFixed(3),
  )

  const timeAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return view.start
    return view.start + ((clientX - rect.left) / rect.width) * view.span
  }
  const capture = (event: PointerEvent<HTMLElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events need not have an active browser pointer.
    }
  }

  const scrubTo = (clientX: number) => clock.set(Math.max(0, timeAt(clientX)))

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
    if (event.ctrlKey || event.metaKey) {
      // Zoom about the pointer: the time under it stays put.
      const pointer = timeAt(event.clientX)
      const factor = Math.exp(event.deltaY * unit * (event.ctrlKey ? 0.01 : 0.002))
      const span = clamp(view.span * factor, SPAN.min, SPAN.max)
      const start = pointer - ((pointer - view.start) / view.span) * span
      setView({ start: Math.max(-span * 0.05, start), span })
      return
    }
    // Pan: sideways scroll (or vertical, for a plain mouse wheel).
    const delta =
      (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit
    setView((current) => ({
      ...current,
      start: Math.max(-current.span * 0.05, current.start + (delta / rect.width) * current.span),
    }))
  }

  const toggleKeyframe = () => {
    if (at >= 0) {
      anims.removeKeyframe(param, at)
      setSelected(null)
    } else anims.addKeyframe(param, value)
  }

  return (
    <div
      className="keyframe-timeline"
      role="group"
      aria-label={`${label} animation`}
      data-no-pan
      data-own-wheel
    >
      <div className="keyframe-timeline-bar">
        <button
          type="button"
          className="control-button"
          aria-label={playing ? 'pause' : 'play'}
          aria-pressed={playing}
          onClick={() => (playing ? clock.pause() : clock.play(Math.max(last, 1)))}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="control-button keyframe-toggle"
          aria-label={at >= 0 ? `remove ${label} keyframe` : `add ${label} keyframe`}
          aria-pressed={at >= 0}
          title={at >= 0 ? 'Remove the keyframe at the playhead' : 'Add a keyframe at the playhead'}
          onClick={toggleKeyframe}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            <path d="M5 0.8 9.2 5 5 9.2 0.8 5Z" />
          </svg>
        </button>
        {chosen !== null && chosen < keys.length - 1 && (
          <select
            className="keyframe-easing"
            aria-label={`${label} easing`}
            value={keys[chosen]?.easing ?? anims.easings[0]?.value}
            onChange={(e) => anims.setEasing(param, chosen, e.target.value)}
          >
            {anims.easings.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        <output className="keyframe-time" aria-label={`${label} time`}>
          {seconds(time)}
        </output>
      </div>
      <div
        ref={track}
        className="keyframe-track"
        role="slider"
        aria-label={`${label} playhead`}
        aria-valuemin={0}
        aria-valuenow={time}
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          clock.pause()
          setSelected(null)
          scrubbing.current = event.pointerId
          capture(event)
          scrubTo(event.clientX)
        }}
        onPointerMove={(event) => {
          if (scrubbing.current === event.pointerId) scrubTo(event.clientX)
        }}
        onPointerUp={(event) => {
          if (scrubbing.current === event.pointerId) scrubbing.current = null
        }}
        onPointerCancel={() => (scrubbing.current = null)}
        onKeyDown={(event) => {
          const by = event.shiftKey ? 1 : 0.1
          if (event.key === 'ArrowRight') clock.set(time + by)
          else if (event.key === 'ArrowLeft') clock.set(time - by)
          else return
          event.preventDefault()
        }}
      >
        {ticks.map((tick) => (
          <span
            key={tick}
            className="keyframe-tick"
            data-major={Math.abs(tick - Math.round(tick)) < 1e-6 || undefined}
            style={{ left: share(tick) }}
          >
            {Math.abs(tick - Math.round(tick)) < 1e-6 ? `${Math.round(tick)}s` : null}
          </span>
        ))}
        {keys.map((key, i) => (
          <button
            key={i}
            type="button"
            className="keyframe"
            data-selected={chosen === i || undefined}
            aria-label={`${label} keyframe at ${seconds(key.time)}`}
            style={{ left: share(key.time) }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              clock.pause()
              setSelected(i)
              clock.set(key.time)
              drag.current = { pointer: event.pointerId, index: i }
              capture(event)
            }}
            onPointerMove={(event) => {
              const current = drag.current
              if (!current || current.pointer !== event.pointerId) return
              const grid = event.shiftKey ? 0.1 : SNAP
              const to = Math.max(0, Math.round(timeAt(event.clientX) / grid) * grid)
              const index = anims.moveKeyframe(param, current.index, to)
              drag.current = { ...current, index }
              setSelected(index)
              clock.set(to)
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(event) => {
              const by = event.shiftKey ? 0.1 : SNAP
              const delta = event.key === 'ArrowRight' ? by : event.key === 'ArrowLeft' ? -by : 0
              if (!delta) return
              event.preventDefault()
              event.stopPropagation()
              const to = Math.max(0, key.time + delta)
              setSelected(anims.moveKeyframe(param, i, to))
              clock.set(to)
            }}
          />
        ))}
        <span className="keyframe-playhead" style={{ left: share(time) }} />
      </div>
    </div>
  )
}
