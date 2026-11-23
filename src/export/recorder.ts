// Frame-by-frame MP4 recording: each composition handed to `add` becomes one video frame,
// 1/fps after the one before, however long it took to draw: the caller sets the scene to
// each frame's time first, so a slow browser makes a slow export, never a skipped frame.
// Frames are drawn and queued for the encoder at once (WebCodecs via mediabunny), so nothing
// is kept but the encoder's queue (`drain` bounds it); `finish` muxes the MP4. No React.
import {
  BufferTarget,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_VERY_HIGH,
  VideoSample,
  VideoSampleSource,
  type VideoCodec,
} from 'mediabunny'
import { drawComposition, type Composition } from './composite'
import { maxImageScale } from './image'

/** Codecs to try, most compatible first: H.264 plays everywhere, HEVC takes bigger frames. */
const CODECS: VideoCodec[] = ['avc', 'hevc', 'vp9', 'av1']

/** The highest resolution a recording uses (output px per frame px). */
export const MAX_RECORD_SCALE = 3

/** Encoders want even sides. */
export function evenSide(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

/**
 * The scale a frame is recorded at: the artboard's export scale as a whole number, at most
 * MAX_RECORD_SCALE and no more than the frame can be rendered at (`maxImageScale`).
 */
export function recordScale(requested: number, width: number, height: number): number {
  const scale = Number.isFinite(requested) ? Math.round(requested) : 1
  return Math.max(1, Math.min(scale, MAX_RECORD_SCALE, maxImageScale(width, height)))
}

/** The video's size for a frame at a scale (even sides). */
export function recordSize(frame: { width: number; height: number }, scale: number) {
  return { width: evenSide(frame.width * scale), height: evenSide(frame.height * scale) }
}

/** How long `frames` frames last at `fps`, in seconds. */
export function recordLength(frames: number, fps: number): number {
  return fps > 0 ? frames / fps : 0
}

/** Frames for an animation of `duration` s followed by `hold` s of its last frame (at least
 *  one frame). Frame i shows time i / fps. */
export function recordFrameCount(duration: number, hold: number, fps: number): number {
  const seconds = Math.max(0, duration) + Math.max(0, hold)
  return Math.max(1, Math.ceil(seconds * fps - 1e-9))
}

export interface FrameRecorder {
  /** The video's size in px, and the scale it was drawn at (may be below the one asked for,
   *  when no encoder takes the larger size). */
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly fps: number
  /** Frames added so far. */
  readonly frames: number
  /** Draw `composition` now as the next frame, and queue it for the encoder. */
  add(composition: Composition): void
  /** Resolves once fewer than `max` frames wait for the encoder (await it between frames, so
   *  a long render never holds hundreds of full-size frames). */
  drain(max?: number): Promise<void>
  /** Encode what's queued and mux the MP4. The recorder can't be used after. */
  finish(): Promise<Blob>
  /** Drop everything. */
  cancel(): Promise<void>
}

export interface FrameRecorderOptions {
  /** The frame's size in CSS px (the recorded artboard's). */
  frame: { width: number; height: number }
  /** Output px per frame px; lowered (to 1) until an encoder takes the size. */
  scale: number
  fps: number
}

/** Find an encoder for the frame (at the scale, or the largest below it that one takes) and
 *  start an MP4. */
export async function createFrameRecorder(options: FrameRecorderOptions): Promise<FrameRecorder> {
  const { frame, fps } = options
  let scale = Math.max(1, Math.round(options.scale))
  let codec: VideoCodec | null = null
  for (; scale >= 1; scale--) {
    const size = recordSize(frame, scale)
    codec = await getFirstEncodableVideoCodec(CODECS, { ...size, quality: QUALITY_VERY_HIGH })
    if (codec) break
  }
  if (!codec) throw new Error(`This browser can't encode ${frame.width}×${frame.height} video.`)
  const { width, height } = recordSize(frame, scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('No 2D canvas context.')

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const source = new VideoSampleSource({
    codec,
    bitrate: QUALITY_VERY_HIGH,
    latencyMode: 'quality',
  })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  let frames = 0
  let failure: unknown = null
  // Frames reach the encoder one after another (each `add` waits for its backpressure).
  let queue: Promise<void> = Promise.resolve()
  // Each queued frame's promise, until it has been encoded.
  const waiting: Promise<void>[] = []
  let closed = false

  return {
    width,
    height,
    scale,
    fps,
    get frames() {
      return frames
    },
    add(composition) {
      if (closed) return
      // Whatever the even rounding leaves past the drawing stays white, not black.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      drawComposition(ctx, composition, scale)
      // A VideoFrame copies the canvas now, so the canvas can take the next frame at once.
      const sample = new VideoSample(canvas, { timestamp: frames / fps, duration: 1 / fps })
      frames++
      const done: Promise<void> = queue
        .then(() => (failure ? undefined : source.add(sample)))
        .catch((error: unknown) => {
          failure ??= error
        })
        .finally(() => {
          sample.close()
          waiting.splice(waiting.indexOf(done), 1)
        })
      queue = done
      waiting.push(done)
    },
    async drain(max = 3) {
      while (waiting.length >= Math.max(1, max)) await waiting[0]
      if (failure) throw failure
    },
    async finish() {
      closed = true
      await queue
      if (failure) {
        await output.cancel()
        throw failure
      }
      if (!frames) {
        await output.cancel()
        throw new Error('Nothing recorded.')
      }
      await output.finalize()
      if (!target.buffer) throw new Error('Encoding produced no data.')
      return new Blob([target.buffer], { type: 'video/mp4' })
    },
    async cancel() {
      closed = true
      await queue
      if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel()
    },
  }
}
