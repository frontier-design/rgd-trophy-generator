import {
  buildProjectFile,
  getSaveStatus,
  parseProjectFile,
  readSaved,
  restoreProjectFile,
  writeSaved,
} from '../../src/state'
import { DEFAULT_GENERATOR, parseGeneratorDocument } from '../../src/state'
import { parseCanvasDocument, EMPTY_CANVAS } from '../../src/components/CanvasPage/canvasDocument'
import { DEFAULT_SCENE_PARAMS } from '../../src/state'
import { registerFlush } from '../../src/state/persist'

describe('autosave storage', () => {
  it('saves and reads a slot, and reports when', () => {
    expect(readSaved('canvas')).toBeUndefined()
    expect(writeSaved('canvas', { a: 1 })).toBe(true)
    expect(readSaved('canvas')).toEqual({ a: 1 })
    expect(getSaveStatus().savedAt).not.toBeNull()
  })

  it('reads a broken save as none', () => {
    window.localStorage.setItem('rgd-generator:canvas', '{nope')
    expect(readSaved('canvas')).toBeUndefined()
  })
})

describe('project files', () => {
  it('bundle every page’s save (pending autosaves first) and the timeline', () => {
    writeSaved('generator', { text: 'HI' })
    const stop = registerFlush(() => writeSaved('canvas', { scenes: [] }))
    const file = buildProjectFile({ sheetsById: {} })
    stop()
    expect(file).toMatchObject({
      app: 'rgd-generator',
      version: 1,
      canvas: { scenes: [] },
      generator: { text: 'HI' },
      timeline: { sheetsById: {} },
    })
  })

  it('round-trip: parse a saved file and restore its pages into storage', () => {
    const file = buildProjectFile()
    file.canvas = { scenes: ['x'] }
    file.generator = { text: 'BACK' }
    const parsed = parseProjectFile(JSON.stringify(file))
    expect(parsed).not.toBeNull()
    writeSaved('canvas', { scenes: [] })
    restoreProjectFile(parsed as NonNullable<typeof parsed>)
    expect(readSaved('canvas')).toEqual({ scenes: ['x'] })
    expect(readSaved('generator')).toEqual({ text: 'BACK' })
  })

  it('refuse files that aren’t projects', () => {
    expect(parseProjectFile('not json')).toBeNull()
    expect(parseProjectFile(JSON.stringify({ app: 'other', version: 1 }))).toBeNull()
  })
})

describe('saved documents', () => {
  it('load a saved canvas over today’s defaults, dropping broken nodes and dangling links', () => {
    const doc = parseCanvasDocument({
      scenes: [
        { id: 'scene-4', x: 10, y: 20, settings: { text: 'OLD' }, scene: { taper: 30 } },
        { nope: true },
      ],
      twists: [{ id: 'twist-2', params: { flutes: 9 } }],
      modifiers: [
        { id: 'etch-3', kind: 'etch', params: { lines: 2 } },
        { id: 'pattern-5', kind: 'pattern', params: { repeats: 3 } },
        { id: 'odd', kind: 'nope' },
      ],
      links: [
        { from: 'twist-2', to: 'scene-4' },
        { from: 'twist-9', to: 'scene-4' },
      ],
      inserted: { scene: 1, twist: 1 },
      view: { x: 5, y: 6, zoom: 0.5 },
    })
    expect(doc.scenes).toHaveLength(1)
    expect(doc.scenes[0]?.settings.text).toBe('OLD')
    expect(doc.scenes[0]?.scene.taper).toBe(30)
    // Settings added since are filled in.
    expect(doc.scenes[0]?.scene.joinRadius).toBe(DEFAULT_SCENE_PARAMS.joinRadius)
    expect(doc.scenes[0]?.animateRevolve).toBe(false)
    // Saves from before etch held only twists (no kind); unknown kinds are dropped.
    expect(doc.modifiers.map((node) => [node.id, node.kind])).toEqual([
      ['twist-2', 'twist'],
      ['etch-3', 'etch'],
      ['pattern-5', 'pattern'],
    ])
    const [twist, etch] = doc.modifiers
    expect(twist?.kind === 'twist' && twist.params.flutes).toBe(9)
    expect(twist?.kind === 'twist' && twist.params.depth).toBeGreaterThan(0)
    expect(etch?.kind === 'etch' && etch.params.lines).toBe(2)
    expect(etch?.kind === 'etch' && etch.params.cross).toBe(true)
    expect(doc.links).toEqual([{ from: 'twist-2', to: 'scene-4' }])
    // New ids continue past the highest one there.
    expect(doc.inserted).toEqual({
      scene: 4,
      composition: 0,
      twist: 2,
      etch: 3,
      pattern: 5,
      texture: 0,
      material: 0,
      lighting: 0,
      text: 0,
    })
    const pattern = doc.modifiers[2]
    expect(pattern?.kind === 'pattern' && pattern.params.repeats).toBe(3)
    expect(pattern?.kind === 'pattern' && pattern.params.image).toMatch(/ornament-sample/)
    expect(doc.view).toEqual({ x: 5, y: 6, zoom: 0.5 })
  })

  it('load nothing (or junk) as the empty canvas and the default generator', () => {
    expect(parseCanvasDocument(undefined)).toEqual(EMPTY_CANVAS)
    expect(parseCanvasDocument('junk')).toEqual(EMPTY_CANVAS)
    expect(parseGeneratorDocument(undefined)).toEqual(DEFAULT_GENERATOR)
    expect(parseGeneratorDocument({ text: 'X', fps: 7, debug: false })).toMatchObject({
      text: 'X',
      fps: DEFAULT_GENERATOR.fps,
      debug: false,
    })
  })
})

describe('another tab', () => {
  it('writing what it already holds isn’t a change', () => {
    writeSaved('canvas', { same: true })
    const text = window.localStorage.getItem('rgd-generator:canvas')
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'rgd-generator:canvas', newValue: text }),
    )
    expect(writeSaved('canvas', { same: false })).toBe(true)
  })

  it('saving the same page stops this tab autosaving it, with a warning', () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'rgd-generator:generator' }))
    expect(writeSaved('generator', { text: 'stale' })).toBe(false)
    expect(getSaveStatus().error).toMatch(/another tab/)
    // Other pages still save.
    expect(writeSaved('canvas', { scenes: [] })).toBe(true)
    expect(getSaveStatus().error).toMatch(/another tab/)
  })
})

describe('large values stored apart', () => {
  it('stores a blob once by content, loads it back, and passes plain values through', async () => {
    const { storeBlob, loadBlob } = await import('../../src/state')
    const image = 'data:image/png;base64,' + 'A'.repeat(5000)
    const ref = storeBlob(image)
    expect(ref).toMatch(/^rgd-blob:/)
    expect(storeBlob(image)).toBe(ref)
    expect(loadBlob(ref)).toBe(image)
    expect(loadBlob('/images/x.png')).toBe('/images/x.png')
    expect(loadBlob('rgd-blob:missing')).toBeNull()
  })

  it('keeps autosaved canvases small: pattern images apart, put back on load and in files', async () => {
    const { storeCanvasDocument, parseCanvasDocument } =
      await import('../../src/components/CanvasPage/canvasDocument')
    const { createModifier } = await import('../../src/components/CanvasPage/graph')
    const { buildProjectFile } = await import('../../src/state')
    const image = 'data:image/png;base64,' + 'B'.repeat(20000)
    const pattern = createModifier('pattern', 'pattern-1', 'pattern 1', 0, 0)
    const node = { ...pattern, params: { ...pattern.params, image } } as typeof pattern
    const doc = { ...parseCanvasDocument(undefined), modifiers: [node] }

    const stored = storeCanvasDocument(doc)
    expect(JSON.stringify(stored).length).toBeLessThan(2000)
    writeSaved('canvas', stored)
    // Loading puts the image back.
    const loaded = parseCanvasDocument(readSaved('canvas'))
    expect(loaded.modifiers[0]?.kind === 'pattern' && loaded.modifiers[0].params.image).toBe(image)
    // A project file carries the image itself.
    expect(JSON.stringify(buildProjectFile())).toContain(image)
  })

  it('removes images no longer used', async () => {
    const { storeBlob, loadBlob, pruneBlobs } = await import('../../src/state')
    const keep = storeBlob('data:keep')
    const drop = storeBlob('data:drop')
    pruneBlobs(new Set([keep]))
    expect(loadBlob(keep)).toBe('data:keep')
    expect(loadBlob(drop)).toBeNull()
  })
})
