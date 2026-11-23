import type { Composition } from '../../src/export'

// mediabunny's encoder needs WebCodecs (not in jsdom): a fake that records what it's given.
const encoded = vi.hoisted(() => ({
  samples: [] as Array<{ timestamp: number; duration: number }>,
  closed: 0,
  maxSide: Infinity,
  finalized: false,
  canceled: false,
}))
vi.mock('mediabunny', () => ({
  QUALITY_VERY_HIGH: 'very-high',
  getFirstEncodableVideoCodec: async (_: unknown, size: { width: number; height: number }) =>
    Math.max(size.width, size.height) <= encoded.maxSide ? 'avc' : null,
  BufferTarget: class {
    buffer: ArrayBuffer | null = null
  },
  Mp4OutputFormat: class {},
  VideoSample: class {
    constructor(_: unknown, init: { timestamp: number; duration: number }) {
      encoded.samples.push(init)
    }
    close() {
      encoded.closed++
    }
  },
  VideoSampleSource: class {
    async add() {}
  },
  Output: class {
    state = 'pending'
    target: { buffer: ArrayBuffer | null }
    constructor(options: { target: { buffer: ArrayBuffer | null } }) {
      this.target = options.target
    }
    addVideoTrack() {}
    async start() {
      this.state = 'started'
    }
    async finalize() {
      this.target.buffer = new ArrayBuffer(8)
      this.state = 'finalized'
      encoded.finalized = true
    }
    async cancel() {
      this.state = 'canceled'
      encoded.canceled = true
    }
  },
}))

import {
  createFrameRecorder,
  evenSide,
  MAX_RECORD_SCALE,
  recordFrameCount,
  recordLength,
  recordScale,
  recordSize,
} from '../../src/export/recorder'

const composition = (width: number, height: number): Composition => ({
  width,
  height,
  background: '#ffffff',
  images: [],
  text: [],
})

beforeEach(() => {
  encoded.samples = []
  encoded.closed = 0
  encoded.maxSide = Infinity
  encoded.finalized = false
  encoded.canceled = false
})

it("records at the artboard's export scale, at most ×3, whole numbers only", () => {
  expect(MAX_RECORD_SCALE).toBe(3)
  expect(recordScale(1, 1920, 1080)).toBe(1)
  expect(recordScale(2, 1920, 1080)).toBe(2)
  expect(recordScale(3, 1920, 1080)).toBe(3)
  expect(recordScale(5, 1920, 1080)).toBe(3)
  expect(recordScale(2.4, 1920, 1080)).toBe(2)
  expect(recordScale(0, 1920, 1080)).toBe(1)
  expect(recordScale(Number.NaN, 1920, 1080)).toBe(1)
  // A frame too big to render at ×3 (16384 px sides at most).
  expect(recordScale(3, 6000, 3000)).toBe(2)
})

it('takes even sides, and lasts a frame per 1/fps', () => {
  expect(evenSide(1081)).toBe(1082)
  expect(evenSide(1)).toBe(2)
  expect(recordSize({ width: 1920, height: 1080 }, 3)).toEqual({ width: 5760, height: 3240 })
  expect(recordSize({ width: 333, height: 257 }, 1)).toEqual({ width: 334, height: 258 })
  expect(recordLength(90, 30)).toBe(3)
  expect(recordLength(0, 30)).toBe(0)
})

it('places each added frame 1/fps after the last, however long it took to arrive', async () => {
  const recorder = await createFrameRecorder({
    frame: { width: 64, height: 32 },
    scale: 2,
    fps: 25,
  })
  expect([recorder.width, recorder.height, recorder.scale]).toEqual([128, 64, 2])
  for (let i = 0; i < 3; i++) recorder.add(composition(64, 32))
  expect(recorder.frames).toBe(3)
  const blob = await recorder.finish()
  expect(blob.type).toBe('video/mp4')
  expect(encoded.finalized).toBe(true)
  expect(encoded.samples).toEqual([
    { timestamp: 0, duration: 0.04 },
    { timestamp: 0.04, duration: 0.04 },
    { timestamp: 0.08, duration: 0.04 },
  ])
  // Every frame handed to the encoder is freed.
  expect(encoded.closed).toBe(3)
  // Finished: no more frames.
  recorder.add(composition(64, 32))
  expect(recorder.frames).toBe(3)
})

it('drops to a lower scale when no encoder takes the size', async () => {
  encoded.maxSide = 4000
  const recorder = await createFrameRecorder({
    frame: { width: 1920, height: 1080 },
    scale: 3,
    fps: 30,
  })
  expect([recorder.width, recorder.height, recorder.scale]).toEqual([3840, 2160, 2])
  await recorder.cancel()
  expect(encoded.canceled).toBe(true)
})

it('fails when nothing can encode the frame, and when finishing with no frames', async () => {
  encoded.maxSide = 10
  await expect(
    createFrameRecorder({ frame: { width: 64, height: 64 }, scale: 1, fps: 30 }),
  ).rejects.toThrow("can't encode")
  encoded.maxSide = Infinity
  const recorder = await createFrameRecorder({
    frame: { width: 64, height: 64 },
    scale: 1,
    fps: 30,
  })
  await expect(recorder.finish()).rejects.toThrow('Nothing recorded')
})

it('renders the animation then the hold, a frame per 1/fps', () => {
  // 2.5 s of typing + 1 s hold at 30 fps: frames at 0, 1/30, … 3.4666 s.
  expect(recordFrameCount(2.5, 1, 30)).toBe(105)
  expect(recordFrameCount(0, 1, 24)).toBe(24)
  // Always at least one frame.
  expect(recordFrameCount(0, 0, 30)).toBe(1)
  expect(recordFrameCount(1 / 3, 0, 30)).toBe(10)
})

it('holds the caller back while frames wait for the encoder', async () => {
  const recorder = await createFrameRecorder({
    frame: { width: 64, height: 32 },
    scale: 1,
    fps: 30,
  })
  for (let i = 0; i < 5; i++) recorder.add(composition(64, 32))
  await recorder.drain(1)
  // Everything queued has been encoded (and freed).
  expect(encoded.closed).toBe(5)
  await recorder.finish()
})
