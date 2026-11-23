import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { downloadBlob, drawComposition, type Composition } from '../../export'
import {
  createFrameRecorder,
  recordFrameCount,
  recordLength,
  recordScale,
  recordSize,
  type FrameRecorder,
} from '../../export/recorder'
import type { SceneFrameSource } from './CanvasScene'
import { useNodeDrag, useNodePosition } from './nodeDrag'
import { RecordTimeline } from './RecordTimeline'
import {
  RECORD_FPS,
  RECORD_HOLD_RANGE,
  recordTimeline,
  type PlacedRecordNode,
  type RecordNode,
  type TimelineRow,
} from './recordNode'
import {
  BACKSPACE_PAUSE_RANGE,
  BACKSPACE_SPEED_RANGE,
  DEFAULT_BACKSPACE,
  LINE_SPEED_RANGE,
  type TextParams,
} from './textLines'

/** The animation a record node renders: the text node linked into its scene. */
export interface RecordTyping {
  id: string
  name: string
  params: TextParams
}

export interface CanvasRecordProps {
  node: PlacedRecordNode
  selected: boolean
  getZoom: () => number
  /** The linked scene, and its export scale (the artboard's resolution; capped at ×3). */
  inputId: string | null
  inputScale: number
  typing: RecordTyping | null
  getFrameSource: (id: string) => SceneFrameSource | undefined
  /** Show text node `id` `seconds` into its animation (null: back to normal). `sync`
   *  commits at once, so the scene is drawn when it returns (rendering). */
  seekTyping: (id: string, seconds: number | null, sync?: boolean) => void
  onSelect: (id: string, additive?: boolean, preserveGroup?: boolean) => void
  onMove: (id: string, x: number, y: number) => void
  onInputDown: (id: string, event: PointerEvent) => void
  onChange: (id: string, patch: Partial<Pick<RecordNode, 'fps' | 'holdIn' | 'holdOut'>>) => void
  /** Retiming the text node from the timeline (its lines' speeds, its backspace). */
  onTextChange: (id: string, patch: Partial<TextParams>) => void
}

/** The preview's longer side, in output px. */
const PREVIEW = 640
/** Let the page paint (progress, preview) every this many frames. */
const PAINT_EVERY = 4

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const clamp = (value: number, range: { min: number; max: number }) =>
  Math.min(range.max, Math.max(range.min, value))
/** Rounded to `step` (sliders' steps, so dragged values read cleanly). */
const snap = (value: number, step: number) => Math.round(value / step) * step

/**
 * A record node: an artboard the size of its input showing the last frame rendered, and
 * beside it Render, the frame rate and a timeline (hold in, each text line typing, the pause
 * and deleting of the scene's text node, hold out). The timeline scrubs and plays the scene
 * live, and its bars' ends retime the text node and the holds. Render runs its own clock:
 * for frame i it seeks the text node to i / fps seconds less the hold in, draws the scene at
 * its export scale (up to ×3) and queues the frame for the encoder. Every frame is drawn
 * however long it takes, so a slow browser makes a slow export, never a skipped frame.
 */
export const CanvasRecord = memo(function CanvasRecord({
  node,
  selected,
  getZoom,
  inputId,
  inputScale,
  typing,
  getFrameSource,
  seekTyping,
  onSelect,
  onMove,
  onInputDown,
  onChange,
  onTextChange,
}: CanvasRecordProps) {
  const { id, frame, fps, holdIn, holdOut } = node
  const position = useNodePosition(id, node)
  const drag = useNodeDrag(node, getZoom, onMove)
  const [rendered, setRendered] = useState<{ done: number; total: number } | null>(null)
  const [status, setStatus] = useState('')
  const [hasPreview, setHasPreview] = useState(false)
  const preview = useRef<HTMLCanvasElement>(null)
  const controller = useRef<AbortController | null>(null)
  // Leaving mid-render stops it (the finally restores the scene).
  useEffect(() => () => controller.current?.abort(), [])

  const rendering = rendered !== null
  const scale = inputId ? recordScale(inputScale, frame.width, frame.height) : 0
  const size = recordSize(frame, scale || 1)
  const text = typing?.params ?? null
  const timeline = useMemo(() => recordTimeline(holdIn, holdOut, text), [holdIn, holdOut, text])
  const total = recordFrameCount(timeline.duration, 0, fps)
  const textId = typing?.id ?? null

  // --- The playhead: scrubbing or playing pins the scene's text at that time; null leaves
  // the scene its own text. Deselecting the node (or a new text node) lets it go.
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const latest = useRef({ textId, holdIn, duration: timeline.duration })
  const latestPlayhead = useRef(playhead)
  useEffect(() => {
    latest.current = { textId, holdIn, duration: timeline.duration }
    latestPlayhead.current = playhead
  })
  const show = useCallback(
    (time: number) => {
      setPlayhead(time)
      const { textId, holdIn } = latest.current
      if (textId) seekTyping(textId, time - holdIn)
    },
    [seekTyping],
  )
  const release = useCallback(() => {
    setPlaying(false)
    setPlayhead(null)
    const { textId } = latest.current
    if (textId) seekTyping(textId, null)
  }, [seekTyping])
  useEffect(() => {
    if (!selected) return
    return release
  }, [selected, textId, release])

  // Playing: the playhead follows the clock (a live preview; the render never skips).
  useEffect(() => {
    if (!playing) return
    const from = performance.now() - (latestPlayhead.current ?? 0) * 1000
    let frameId = requestAnimationFrame(function tick() {
      const time = (performance.now() - from) / 1000
      if (time >= latest.current.duration) {
        release()
        return
      }
      show(time)
      frameId = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frameId)
  }, [playing, show, release])
  const play = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    // From the end, play again from the start.
    if (playhead === null || playhead >= timeline.duration - 1e-3) show(0)
    setPlaying(true)
  }
  const restart = () => {
    show(0)
    latestPlayhead.current = 0
    setPlaying(true)
  }
  const scrub = (time: number) => {
    setPlaying(false)
    show(time)
  }

  // --- Retiming: a bar's new length becomes a line's speed, the backspace's pause or
  // speed, or a hold.
  const characters = (row: TimelineRow) =>
    row.kind === 'line'
      ? Array.from(text?.lines[row.index ?? 0]?.text ?? '').length
      : row.kind === 'delete'
        ? (text?.lines ?? []).reduce((sum, line) => sum + Array.from(line.text).length, 0)
        : 1
  const canRetime = (row: TimelineRow) => characters(row) > 0
  const retime = (row: TimelineRow, length: number) => {
    const seconds = Math.max(length, 0.01)
    if (row.kind === 'hold-in' || row.kind === 'hold-out') {
      const value = clamp(snap(length, 0.05), RECORD_HOLD_RANGE)
      onChange(id, row.kind === 'hold-in' ? { holdIn: value } : { holdOut: value })
      return
    }
    if (!typing || !text) return
    const backspace = text.backspace ?? DEFAULT_BACKSPACE
    if (row.kind === 'line') {
      const speed = clamp(snap(characters(row) / seconds, LINE_SPEED_RANGE.step), LINE_SPEED_RANGE)
      onTextChange(typing.id, {
        lines: text.lines.map((line, i) => (i === row.index ? { ...line, speed } : line)),
      })
    } else if (row.kind === 'pause') {
      const pause = clamp(snap(length, BACKSPACE_PAUSE_RANGE.step), BACKSPACE_PAUSE_RANGE)
      onTextChange(typing.id, { backspace: { ...backspace, pause } })
    } else {
      const speed = clamp(
        snap(characters(row) / seconds, BACKSPACE_SPEED_RANGE.step),
        BACKSPACE_SPEED_RANGE,
      )
      onTextChange(typing.id, { backspace: { ...backspace, speed } })
    }
  }

  const drawPreview = (composition: Composition) => {
    const canvas = preview.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const fit = PREVIEW / Math.max(frame.width, frame.height)
    canvas.width = Math.round(frame.width * fit)
    canvas.height = Math.round(frame.height * fit)
    drawComposition(ctx, composition, fit)
    setHasPreview(true)
  }

  const render = async () => {
    if (controller.current) {
      controller.current.abort()
      return
    }
    const source = inputId ? getFrameSource(inputId) : undefined
    if (!inputId || !source) {
      setStatus('Link a scene into this node to render it.')
      return
    }
    if (typeof VideoEncoder === 'undefined') {
      setStatus("This browser can't encode video (no WebCodecs).")
      return
    }
    setPlaying(false)
    const abort = new AbortController()
    controller.current = abort
    // What this render uses, fixed at its start.
    const renderText = textId
    const lead = holdIn
    const count = total
    const rate = fps
    const { width, height } = frame
    setStatus('')
    setRendered({ done: 0, total: count })
    let recorder: FrameRecorder | null = null
    try {
      recorder = await createFrameRecorder({ frame, scale, fps: rate })
      for (let i = 0; i < count; i++) {
        abort.signal.throwIfAborted()
        // The scene at this frame's time: before the hold in ends, nothing typed yet; past
        // the animation, its end state.
        if (renderText) seekTyping(renderText, i / rate - lead, true)
        const composition = source.compose(recorder.scale)
        if (composition.width !== width || composition.height !== height)
          throw new Error("The scene's size changed while rendering.")
        recorder.add(composition)
        if (i % PAINT_EVERY === 0 || i === count - 1) {
          drawPreview(composition)
          setRendered({ done: i + 1, total: count })
          setPlayhead(i / rate)
          await nextTask()
        }
        // Never more than a few full-size frames waiting for the encoder.
        await recorder.drain()
      }
      setStatus('Encoding…')
      const blob = await recorder.finish()
      recorder = null
      downloadBlob(blob, `${node.name}.mp4`)
      setStatus(`Saved ${count} frames, ${recordLength(count, rate).toFixed(2)} s.`)
    } catch (error) {
      setStatus(
        abort.signal.aborted ? 'Canceled.' : error instanceof Error ? error.message : String(error),
      )
    } finally {
      void recorder?.cancel()
      if (renderText) seekTyping(renderText, null)
      source.release()
      controller.current = null
      setRendered(null)
      setPlayhead(null)
    }
  }

  const summary = inputId
    ? `${total} frames · ${recordLength(total, fps).toFixed(2)} s · ${size.width} × ${size.height} (×${scale})`
    : 'no input'

  return (
    <div
      className="canvas-scene record-node"
      aria-label={node.name}
      data-record-node
      data-scene-id={id}
      data-no-pan
      data-selected={selected || undefined}
      data-recording={rendering || undefined}
      style={
        {
          left: node.x,
          top: node.y,
          transform:
            position === node
              ? undefined
              : `translate(${position.x - node.x}px, ${position.y - node.y}px)`,
          '--artboard-width': `${frame.width}px`,
          '--artboard-height': `${frame.height}px`,
        } as CSSProperties
      }
      {...drag}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        onSelect(id, event.shiftKey, true)
        if (!event.shiftKey) drag.onPointerDown(event)
      }}
    >
      <div className="canvas-scene-name">{node.name}</div>
      <canvas ref={preview} className="record-preview" />
      {!hasPreview && (
        <p className="record-empty">
          {inputId ? 'Render to export the animation as an MP4' : 'Link a scene to record'}
        </p>
      )}
      <div
        className="record-tools"
        data-no-pan
        data-handle
        onPointerDown={(event) => {
          // Using the timeline selects the node (deselecting it lets the scene go).
          event.stopPropagation()
          if (event.button === 0 && !selected) onSelect(id)
        }}
      >
        <div className="record-buttons">
          <button
            type="button"
            className="control-button"
            aria-pressed={rendering}
            onClick={() => void render()}
          >
            {rendering ? 'cancel' : 'render'}
          </button>
          <select
            aria-label="frame rate"
            value={fps}
            disabled={rendering}
            onChange={(event) => onChange(id, { fps: Number(event.target.value) })}
          >
            {RECORD_FPS.map((rate) => (
              <option key={rate} value={rate}>
                {rate} fps
              </option>
            ))}
          </select>
          <output className="record-status" aria-label="recording">
            {rendered ? `frame ${rendered.done} / ${rendered.total}` : summary}
          </output>
        </div>
        {inputId && (
          <RecordTimeline
            rows={timeline.rows}
            duration={timeline.duration}
            playhead={playhead}
            playing={playing}
            disabled={rendering}
            canRetime={canRetime}
            onScrub={scrub}
            onPlay={play}
            onRestart={restart}
            onRetime={retime}
          />
        )}
        {inputId && !typing && (
          <p className="record-status">
            No text node is linked to the scene: the video holds it as it is.
          </p>
        )}
        {status && <p className="record-status">{status}</p>}
      </div>
      <span
        className="node-port node-port-in"
        data-port="in"
        data-scene-id={id}
        data-connected={inputId ? true : undefined}
        aria-label={`${node.name} input`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          if (event.shiftKey) onSelect(id, true)
          else onInputDown(id, event)
        }}
      />
    </div>
  )
})
