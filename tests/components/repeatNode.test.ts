import { createCanvas } from 'canvas'
import { createModifier, modifiersByScene } from '../../src/components/CanvasPage/graph'
import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import {
  DEFAULT_REPEAT,
  createRepeatNode,
  repeatScale,
  repeatSpacing,
} from '../../src/components/CanvasPage/repeatNode'
import {
  REPEAT_MAX_PER_AXIS,
  drawRepeatArtwork,
  repeatGrid,
  repeatPitch,
  type RepeatArtwork,
} from '../../src/components/CanvasPage/repeatArtwork'
import {
  copySelection,
  pasteSelection,
  replaceSelection,
} from '../../src/components/CanvasPage/selection'

const trophy = { width: 20, height: 30 }

function node(overrides: Partial<ReturnType<typeof createRepeatNode>> = {}) {
  return { ...createRepeatNode('repeat-1', 'repeat 1', 0, 0), ...overrides }
}

function recordingContext() {
  const calls: Array<{ text: string; x: number; y: number }> = []
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
    clearRect() {},
    translate() {},
    scale() {},
    drawImage() {},
    fillText(text: string, x: number, y: number) {
      calls.push({ text, x, y })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

function artwork(overrides: Partial<RepeatArtwork> = {}): RepeatArtwork {
  const base = node()
  return {
    frame: { width: 100, height: 100 },
    node: { ...base, layout: { ...base.layout, spacingX: 20, spacingY: 10 } },
    trophy: { ...trophy, centerX: 10, centerY: 15 },
    image: null,
    sourceWidth: 40,
    sourceHeight: 60,
    baselines: [20],
    lines: ['RGD'],
    textColor: '#111111',
    fontWeight: 600,
    ...overrides,
  }
}

describe('repeat geometry', () => {
  it('makes a regular aligned grid with proportional fractional scale', () => {
    const grid = repeatGrid(
      { width: 400, height: 300 },
      node({ layout: { ...DEFAULT_REPEAT.layout, scale: 0.5, spacingX: 20, spacingY: 10 } }),
      trophy,
    )
    expect(grid.pitchX).toBe((20 + 20) * 0.5)
    expect(grid.pitchY).toBe((30 + 10) * 0.5)
    expect(grid.tileWidth).toBe(10)
    expect(grid.columns.count).toBeGreaterThan(1)
    expect(grid.rows.count).toBeGreaterThan(1)
  })

  it('keeps pitch positive for negative spacing and malformed saved values', () => {
    expect(repeatPitch(20, -10_000, 1)).toBe(1)
    expect(repeatScale(Number.NaN)).toBe(DEFAULT_REPEAT.layout.scale)
    expect(repeatSpacing(Number.POSITIVE_INFINITY)).toBe(0)
    const grid = repeatGrid(
      { width: 100, height: 100 },
      node({ layout: { scale: 1, spacingX: -500, spacingY: -500, offsetX: 0, offsetY: 0 } }),
      trophy,
    )
    expect(grid.pitchX).toBe(1)
    expect(grid.pitchY).toBe(1)
    expect(grid.columns.count).toBeLessThanOrEqual(REPEAT_MAX_PER_AXIS)
  })

  it('covers large offsets with a bounded number of visible copies', () => {
    const grid = repeatGrid(
      { width: 1920, height: 1080 },
      node({ layout: { scale: 1, spacingX: 0, spacingY: 0, offsetX: 999_999, offsetY: -999_999 } }),
      trophy,
    )
    expect(Number.isFinite(grid.offsetX)).toBe(true)
    expect(grid.columns.count).toBeGreaterThan(0)
    expect(grid.columns.count).toBeLessThanOrEqual(REPEAT_MAX_PER_AXIS)
    expect(grid.rows.count).toBeLessThanOrEqual(REPEAT_MAX_PER_AXIS)
    expect(grid.pitchX).toBe(20)
    expect(grid.pitchY).toBe(30)
  })

  it('centers one text copy in each gap between trophies', () => {
    const { ctx, calls } = recordingContext()
    drawRepeatArtwork(ctx, artwork())
    // Trophy centers are at 0 and 40: the text belongs at 20 (and 60, …).
    expect(calls.some((call) => Math.abs(call.x - 20) < 1e-9)).toBe(true)
    expect(calls.every((call) => call.y === 0 || [-35, 5, 45, 85, 125].includes(call.y))).toBe(true)
  })

  it('draws the background and trophies at 1× and 2×, with transparency and clipping', () => {
    const trophyCanvas = createCanvas(20, 20)
    const trophyCtx = trophyCanvas.getContext('2d')
    trophyCtx.fillStyle = '#ff0000'
    trophyCtx.fillRect(0, 0, 20, 20)
    const sample = (scale: number, transparent: boolean) => {
      const canvas = createCanvas(100 * scale, 100 * scale)
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      drawRepeatArtwork(
        ctx as unknown as CanvasRenderingContext2D,
        artwork({
          image: trophyCanvas as unknown as CanvasImageSource,
          baselines: [],
          lines: [],
          trophy: { width: 20, height: 20, centerX: 10, centerY: 10 },
          sourceWidth: 20,
          sourceHeight: 20,
        }),
        { transparent },
      )
      const data = ctx.getImageData(2 * scale, 2 * scale, 1, 1).data
      const gap = ctx.getImageData(25 * scale, 25 * scale, 1, 1).data
      return { trophy: [...data], gap: [...gap] }
    }
    const one = sample(1, false)
    const two = sample(2, false)
    expect(one.trophy.slice(0, 3)).toEqual([255, 0, 0])
    expect(two.trophy.slice(0, 3)).toEqual([255, 0, 0])
    expect(one.gap).toEqual([255, 255, 255, 255])
    expect(two.gap).toEqual([255, 255, 255, 255])
    const transparent = sample(1, true)
    expect(transparent.gap[3]).toBe(0)
    expect(transparent.trophy[3]).toBe(255)
  })
})

describe('shared modifiers', () => {
  it('resolves every shared modifier for a repeat target with the same precedence and mute rules', () => {
    const kinds = ['shape', 'twist', 'etch', 'pattern', 'texture', 'material', 'lighting', 'text'] as const
    const nodes = kinds.map((kind, index) => createModifier(kind, `${kind}-1`, kind, index, 0))
    const pattern = nodes[3]!
    if (pattern.kind !== 'pattern') throw new Error('not a pattern')
    const map = new Map([['pattern-1', { width: 1, height: 1, data: new Float32Array([1]) }]])
    const links = nodes.map((node) => ({ from: node.id, to: 'repeat-1' }))
    const resolved = modifiersByScene(links, nodes, map as never).get('repeat-1')!
    expect(resolved.shape).toEqual(nodes[0]!.params)
    expect(resolved.twists).toEqual([nodes[1]!.params])
    expect(resolved.etches).toEqual([nodes[2]!.params])
    expect(resolved.patterns).toHaveLength(1)
    expect(resolved.textures).toEqual([nodes[4]!.params])
    expect(resolved.material).toEqual(nodes[5]!.params)
    expect(resolved.lighting).toEqual(nodes[6]!.params)
    expect(resolved.text).toBe((nodes[7]!.params as { text: string }).text)
    expect(
      modifiersByScene(
        links.map((link) => ({ ...link, muted: true })),
        nodes,
        map as never,
      ).get('repeat-1'),
    ).toBeUndefined()
  })
})

describe('repeat persistence', () => {
  it('round-trips the artboard, typography, layout, background and connections', () => {
    const repeat = createRepeatNode('repeat-2', 'repeat 2', 120, 80)
    repeat.frame = { width: 800, height: 600 }
    repeat.typography = { ...repeat.typography, fontSize: 72, lineHeight: 66, columnWidth: 420 }
    repeat.layout = { scale: 0.75, spacingX: -30, spacingY: 12, offsetX: 40, offsetY: -5 }
    repeat.background = '#112233'
    repeat.imageExport = { format: 'png', scale: 3, transparent: true }
    const text = createModifier('text', 'text-1', 'text 1', 0, 0)
    const shape = createModifier('shape', 'shape-1', 'shape 1', 0, 0)
    const doc = parseCanvasDocument({
      repeats: [repeat],
      modifiers: [text, shape],
      links: [
        { from: 'text-1', to: 'repeat-2' },
        { from: 'shape-1', to: 'repeat-2', muted: true },
        { from: 'shape-1', to: 'repeat-2' },
      ],
      inserted: { repeat: 2 },
    })
    expect(doc.repeats[0]).toEqual(repeat)
    expect(doc.links).toEqual([
      { from: 'text-1', to: 'repeat-2' },
      { from: 'shape-1', to: 'repeat-2', muted: true },
      { from: 'shape-1', to: 'repeat-2' },
    ])
    expect(doc.inserted.repeat).toBe(2)
    expect(parseCanvasDocument(doc)).toEqual(doc)
  })

  it('sanitizes malformed frames, layout and typography, and rejects scene inputs', () => {
    const doc = parseCanvasDocument({
      repeats: [
        {
          id: 'repeat-9',
          frame: { width: 1, height: Number.NaN },
          typography: { fontSize: -2, lineHeight: Number.POSITIVE_INFINITY, columnWidth: 0 },
          layout: { scale: 0, spacingX: Number.NaN, offsetX: Number.NEGATIVE_INFINITY },
        },
      ],
    })
    const repeat = doc.repeats[0]!
    expect(repeat.frame).toEqual({ width: 1920, height: 1080 })
    expect(repeat.typography.fontSize).toBeGreaterThanOrEqual(1)
    expect(repeat.typography.lineHeight).toBeGreaterThanOrEqual(1)
    expect(repeat.typography.columnWidth).toBeGreaterThanOrEqual(32)
    expect(repeat.layout.scale).toBeGreaterThanOrEqual(0.05)
    expect(repeat.layout.spacingX).toBe(0)
    expect(repeat.layout.offsetX).toBe(0)
    expect(repeat.background).toBe('#ffffff')
    expect(doc.inserted.repeat).toBe(9)
    const sceneLink = parseCanvasDocument({
      scenes: [{ id: 'scene-1' }],
      repeats: [createRepeatNode('repeat-1', 'repeat 1', 0, 0)],
      links: [{ from: 'scene-1', to: 'repeat-1' }],
    })
    expect(sceneLink.links).toEqual([])
  })

  it('copies and pastes a repeat artboard with its links', () => {
    const repeat = createRepeatNode('repeat-1', 'repeat 1', 100, 100)
    const text = createModifier('text', 'text-1', 'text 1', 0, 0)
    const copy = copySelection(
      replaceSelection([repeat.id, text.id]),
      [],
      [text],
      [{ from: text.id, to: repeat.id }],
      [],
      [repeat],
    )
    const pasted = pasteSelection(copy, { scene: 0, twist: 0, etch: 0, pattern: 0, texture: 0, material: 0 }, { offset: { x: 20, y: 10 } })
    expect(pasted.repeats[0]).toMatchObject({ id: 'repeat-1', x: 120, y: 110 })
    expect(pasted.links).toEqual([{ from: 'text-1', to: 'repeat-1' }])
  })
})
