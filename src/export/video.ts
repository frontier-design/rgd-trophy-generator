// MP4 export: steps through the timeline frame by frame, draws each frame onto a canvas and
// encodes it with WebCodecs (via mediabunny) into an MP4. No React.
import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_VERY_HIGH,
  type VideoCodec,
} from 'mediabunny'

/** Codecs to try, most compatible first: H.264 plays everywhere. */
const CODECS: VideoCodec[] = ['avc', 'hevc', 'vp9', 'av1']

export interface Mp4ExportOptions {
  /** Output size in px. */
  width: number
  height: number
  fps: number
  /** Seconds. */
  duration: number
  /** Move the scene to `seconds` and resolve once it's ready to draw. */
  seek(seconds: number): Promise<void>
  /** Draw the current frame onto `ctx` (the full width × height canvas). */
  draw(ctx: CanvasRenderingContext2D): void
  /** Frames done, of total. */
  onProgress?(done: number, total: number): void
  signal?: AbortSignal
}

/** Render and encode the frames; resolves with the MP4 file. */
export async function exportMp4(options: Mp4ExportOptions): Promise<Blob> {
  const { width, height, fps, duration, seek, draw, onProgress, signal } = options
  const codec = await getFirstEncodableVideoCodec(CODECS, {
    width,
    height,
    quality: QUALITY_VERY_HIGH,
  })
  if (!codec) throw new Error(`This browser can't encode ${width}×${height} video.`)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('No 2D canvas context.')

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const source = new CanvasSource(canvas, {
    codec,
    quality: QUALITY_VERY_HIGH,
    latencyMode: 'quality',
  })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  const total = Math.max(1, Math.round(duration * fps))
  try {
    for (let i = 0; i < total; i++) {
      signal?.throwIfAborted()
      const seconds = i / fps
      await seek(seconds)
      draw(ctx)
      await source.add(seconds, 1 / fps)
      onProgress?.(i + 1, total)
    }
    signal?.throwIfAborted()
    await output.finalize()
  } catch (error) {
    if (output.state !== 'finalized') await output.cancel()
    throw error
  }
  if (!target.buffer) throw new Error('Encoding produced no data.')
  return new Blob([target.buffer], { type: 'video/mp4' })
}

/** Save `blob` as a download named `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
