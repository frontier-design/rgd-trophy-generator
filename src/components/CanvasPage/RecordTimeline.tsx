import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { TimelineRow } from './recordNode'

interface RecordTimelineProps {
  rows: readonly TimelineRow[]
  /** The video's length (s). */
  duration: number
  /** Where the playhead is (s), or null when the scene shows its own text. */
  playhead: number | null
  playing: boolean
  /** While rendering: shown, not editable. */
  disabled: boolean
  /** Rows whose length can be dragged (empty lines can't: they take no time). */
  canRetime: (row: TimelineRow) => boolean
  onScrub: (seconds: number) => void
  onPlay: () => void
  onRestart: () => void
  /** A row dragged to `seconds` long. */
  onRetime: (row: TimelineRow, seconds: number) => void
}

/** Ruler steps (s): the first giving at most ~12 ticks. */
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10]

const seconds = (value: number) => `${value < 10 ? value.toFixed(2) : value.toFixed(1)}`

/**
 * A record node's timeline, like a motion tool's: a ruler, one row per stretch of the video
 * (hold in, each text line typing, the pause and deleting, hold out) with its bar and length,
 * and a playhead. Drag on the ruler or rows to scrub; drag a bar's right end to retime it.
 */
export function RecordTimeline({
  rows,
  duration,
  playhead,
  playing,
  disabled,
  canRetime,
  onScrub,
  onPlay,
  onRestart,
  onRetime,
}: RecordTimelineProps) {
  const tracks = useRef<HTMLDivElement>(null)
  // While a bar is dragged the scale holds (the total changes with it), so its end follows
  // the pointer; it only grows to fit.
  const [frozen, setFrozen] = useState<number | null>(null)
  const total = Math.max(frozen ?? 0, duration, 0.001)
  const share = (time: number) => `${(Math.min(Math.max(time, 0), total) / total) * 100}%`
  const step = STEPS.find((value) => total / value <= 12) ?? 10
  const ticks = Array.from({ length: Math.floor(total / step + 1e-9) + 1 }, (_, i) => i * step)

  const timeAt = (clientX: number) => {
    const rect = tracks.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    return Math.min(total, Math.max(0, ((clientX - rect.left) / rect.width) * total))
  }

  const scrubbing = useRef<number | null>(null)
  const scrubDown = (event: PointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    scrubbing.current = event.pointerId
    capture(event)
    onScrub(timeAt(event.clientX))
  }
  const scrubMove = (event: PointerEvent<HTMLElement>) => {
    if (scrubbing.current === event.pointerId) onScrub(timeAt(event.clientX))
  }
  const scrubEnd = (event: PointerEvent<HTMLElement>) => {
    if (scrubbing.current === event.pointerId) scrubbing.current = null
  }

  const retiming = useRef<{
    pointer: number
    row: TimelineRow
    x: number
    perSecond: number
  } | null>(null)
  const retimeDown = (row: TimelineRow, event: PointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const width = tracks.current?.getBoundingClientRect().width ?? 0
    if (width <= 0) return
    retiming.current = { pointer: event.pointerId, row, x: event.clientX, perSecond: width / total }
    setFrozen(total)
    capture(event)
  }
  const retimeMove = (event: PointerEvent<HTMLElement>) => {
    const drag = retiming.current
    if (!drag || drag.pointer !== event.pointerId) return
    event.stopPropagation()
    const length = drag.row.end - drag.row.start + (event.clientX - drag.x) / drag.perSecond
    onRetime(drag.row, Math.max(0, length))
  }
  const retimeEnd = (event: PointerEvent<HTMLElement>) => {
    if (retiming.current?.pointer !== event.pointerId) return
    event.stopPropagation()
    retiming.current = null
    setFrozen(null)
  }

  return (
    <div className="record-timeline" data-disabled={disabled || undefined}>
      <div className="record-timeline-bar">
        <button
          type="button"
          className="control-button"
          aria-label={playing ? 'pause' : 'play'}
          aria-pressed={playing}
          disabled={disabled}
          onClick={onPlay}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="control-button"
          aria-label="restart"
          disabled={disabled}
          onClick={onRestart}
        >
          ↺
        </button>
        <output className="record-timeline-time" aria-label="time">
          {seconds(playhead ?? 0)} / {seconds(duration)} s
        </output>
      </div>
      <div className="record-timeline-grid">
        <span />
        <div
          className="record-ruler"
          role="slider"
          aria-label="playhead"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={playhead ?? 0}
          tabIndex={disabled ? -1 : 0}
          onPointerDown={scrubDown}
          onPointerMove={scrubMove}
          onPointerUp={scrubEnd}
          onPointerCancel={scrubEnd}
          onKeyDown={(event) => {
            if (disabled) return
            const by = event.shiftKey ? 1 : 0.1
            const at = playhead ?? 0
            if (event.key === 'ArrowRight') onScrub(Math.min(duration, at + by))
            else if (event.key === 'ArrowLeft') onScrub(Math.max(0, at - by))
            else return
            event.preventDefault()
          }}
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="record-tick"
              data-major={Number.isInteger(tick) || undefined}
              style={{ left: share(tick) }}
            >
              {Number.isInteger(tick) ? `${tick}s` : null}
            </span>
          ))}
          {playhead !== null && (
            <span className="record-playhead-time" style={{ left: share(playhead) }}>
              {seconds(playhead)}
            </span>
          )}
        </div>
        {rows.map((row, i) => (
          <div
            key={`${row.kind}-${row.index ?? i}`}
            className="record-row"
            style={{ display: 'contents' }}
          >
            <span className="record-row-label" title={row.label}>
              {row.label}
            </span>
            <div
              className="record-track"
              ref={i === 0 ? tracks : undefined}
              onPointerDown={scrubDown}
              onPointerMove={scrubMove}
              onPointerUp={scrubEnd}
              onPointerCancel={scrubEnd}
            >
              <div
                className="record-clip"
                data-kind={row.kind}
                // Too short to hold its length: it's written just after it.
                // (before it, at the timeline's end).
                data-narrow={
                  (row.end - row.start) / total < 0.14
                    ? row.end / total > 0.85
                      ? 'before'
                      : 'after'
                    : undefined
                }
                style={
                  { left: share(row.start), width: share(row.end - row.start) } as CSSProperties
                }
              >
                <span className="record-clip-length">{seconds(row.end - row.start)}s</span>
                {canRetime(row) && (
                  <span
                    className="record-clip-handle"
                    role="slider"
                    aria-label={`${row.label} length`}
                    aria-valuenow={row.end - row.start}
                    onPointerDown={(event) => retimeDown(row, event)}
                    onPointerMove={retimeMove}
                    onPointerUp={retimeEnd}
                    onPointerCancel={retimeEnd}
                    onLostPointerCapture={retimeEnd}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
        {playhead !== null && (
          <span
            className="record-playhead"
            style={{ '--at': Math.min(Math.max(playhead, 0), total) / total } as CSSProperties}
          />
        )}
      </div>
    </div>
  )
}

function capture(event: PointerEvent<HTMLElement>) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    /* synthetic pointer */
  }
}
