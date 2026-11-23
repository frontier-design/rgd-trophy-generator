import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import { createModifier } from '../../src/components/CanvasPage/graph'
import {
  createRecordNode,
  DEFAULT_RECORD_FPS,
  DEFAULT_RECORD_HOLD_IN,
  DEFAULT_RECORD_HOLD_OUT,
  recordFps,
  recordFrame,
  recordHold,
  recordTimeline,
} from '../../src/components/CanvasPage/recordNode'
import { createSceneNode } from '../../src/components/CanvasPage/sceneNode'

it("has no size of its own: it takes its input's frame", () => {
  expect(recordFrame({ width: 1080, height: 1350 })).toEqual({ width: 1080, height: 1350 })
  expect(recordFrame(undefined)).toEqual({ width: 1920, height: 1080 })
})

it('keeps a known frame rate, or the default', () => {
  expect(recordFps(60)).toBe(60)
  expect(recordFps(31)).toBe(DEFAULT_RECORD_FPS)
  expect(recordFps('30')).toBe(DEFAULT_RECORD_FPS)
})

it('keeps a hold within 0–10 s, or the fallback', () => {
  expect(recordHold(2.5, 1)).toBe(2.5)
  expect(recordHold(-1, 1)).toBe(0)
  expect(recordHold(99, 1)).toBe(10)
  expect(recordHold('1', 0.5)).toBe(0.5)
})

it('lays out the timeline: hold in, a row per line, pause and delete, hold out', () => {
  const lines = [
    { text: 'RGD', speed: 3, tracking: 0 },
    { text: '', speed: 8, tracking: 0 },
    { text: 'AB', speed: 4, tracking: 0 },
  ]
  expect(recordTimeline(0.5, 1, { lines })).toEqual({
    rows: [
      { kind: 'hold-in', label: 'hold in', start: 0, end: 0.5 },
      { kind: 'line', index: 0, label: 'RGD', start: 0.5, end: 1.5 },
      // An empty line takes no time; it's named by its number.
      { kind: 'line', index: 1, label: 'line 2', start: 1.5, end: 1.5 },
      { kind: 'line', index: 2, label: 'AB', start: 1.5, end: 2 },
      { kind: 'hold-out', label: 'hold out', start: 2, end: 3 },
    ],
    duration: 3,
  })
  const backspace = { enabled: true, pause: 1, speed: 5 }
  const { rows, duration } = recordTimeline(0, 0.5, { lines, backspace })
  expect(rows.map((row) => [row.kind, row.start, row.end])).toEqual([
    ['hold-in', 0, 0],
    ['line', 0, 1],
    ['line', 1, 1],
    ['line', 1, 1.5],
    ['pause', 1.5, 2.5],
    // 5 characters at 5 a second.
    ['delete', 2.5, 3.5],
    ['hold-out', 3.5, 4],
  ])
  expect(duration).toBe(4)
  // A line's hold: a second bar in its row; everything after moves on by it.
  const held = recordTimeline(0, 0, { lines: [{ ...lines[0]!, hold: 2 }, lines[2]!] })
  expect(held.rows[1]).toEqual({
    kind: 'line',
    index: 0,
    label: 'RGD',
    start: 0,
    end: 1,
    hold: { start: 1, end: 3 },
  })
  expect(held.rows[2]).toMatchObject({ kind: 'line', start: 3, end: 3.5 })
  expect(held.duration).toBe(3.5)
  // No text node: just the holds.
  expect(recordTimeline(0.5, 1, null).duration).toBe(1.5)
})

it('persists record nodes, taking only scene inputs, and continues their ids', () => {
  const scene = createSceneNode('scene-1', 'scene 1', 0, 0)
  const twist = createModifier('twist', 'twist-1', 'twist 1', 0, 0)
  const record = {
    ...createRecordNode('record-4', 'record 4', 10, 20),
    fps: 60,
    holdIn: 0,
    holdOut: 2,
  }
  const doc = parseCanvasDocument({
    scenes: [scene],
    modifiers: [twist],
    records: [record, { id: 'record-5', fps: 7, hold: 3 }, { name: 'no id' }],
    links: [
      { from: scene.id, to: record.id },
      { from: twist.id, to: record.id },
      { from: record.id, to: scene.id },
    ],
  })
  expect(doc.records).toEqual([
    record,
    // A save with one hold (after the typing) keeps it as the hold out.
    {
      id: 'record-5',
      name: 'record-5',
      x: 0,
      y: 0,
      fps: DEFAULT_RECORD_FPS,
      holdIn: DEFAULT_RECORD_HOLD_IN,
      holdOut: 3,
    },
  ])
  expect(doc.links).toEqual([{ from: scene.id, to: record.id }])
  expect(doc.inserted.record).toBe(5)
  expect(createRecordNode('r', 'r', 0, 0).holdOut).toBe(DEFAULT_RECORD_HOLD_OUT)
})

it('loads saves from before record nodes', () => {
  expect(parseCanvasDocument({ scenes: [] }).records).toEqual([])
})
