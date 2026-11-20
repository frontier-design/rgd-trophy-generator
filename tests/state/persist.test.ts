import {
  ASSET_PREFIX,
  buildProjectFile,
  clearImageAssetCaches,
  getSaveStatus,
  inlineImageAssets,
  loadImageAsset,
  parseProjectFile,
  pruneImageAssets,
  readSaved,
  restoreProjectFile,
  setImageAssetStore,
  setSaveError,
  storeBlob,
  storeImageAsset,
  writeSaved,
} from '../../src/state'
import { DEFAULT_GENERATOR, parseGeneratorDocument } from '../../src/state'
import {
  hydrateCanvasDocument,
  parseCanvasDocument,
  storeCanvasDocument,
  EMPTY_CANVAS,
} from '../../src/components/CanvasPage/canvasDocument'
import { DEFAULT_PATTERN, createModifier } from '../../src/components/CanvasPage/graph'
import { DEFAULT_SCENE_PARAMS } from '../../src/state'
import { registerFlush } from '../../src/state/persist'
import { fittedSize } from '../../src/components/CanvasPage/patternImage'
import { createFakeIndexedDb } from '../support/fakeIndexedDb'
import type { CanvasDocument } from '../../src/components/CanvasPage/canvasDocument'

const IMAGE = 'data:image/png;base64,' + 'B'.repeat(20000)

function patternDocument(image = IMAGE, patch = {}): CanvasDocument {
  const base = parseCanvasDocument(undefined)
  const pattern = createModifier('pattern', 'pattern-1', 'pattern 1', 0, 0)
  return {
    ...base,
    modifiers: [{ ...pattern, params: { ...DEFAULT_PATTERN, ...patch, image } }] as typeof base.modifiers,
  }
}

/** A fresh fake IndexedDB for a test, as the browser would have on a fresh profile. */
function freshIndexedDb() {
  const factory = createFakeIndexedDb()
  vi.stubGlobal('indexedDB', factory)
  setImageAssetStore(null)
  clearImageAssetCaches()
  return factory
}

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

  it('surfaces an explicit storage/asset failure', () => {
    setSaveError('Missing image asset: rgd-asset:nope')
    expect(getSaveStatus().error).toMatch(/Missing image asset/)
  })
})

describe('project files', () => {
  it('bundle every page’s save (pending autosaves first) and the timeline', async () => {
    writeSaved('generator', { text: 'HI' })
    let flushed = false
    const stop = registerFlush(async () => {
      await Promise.resolve()
      flushed = true
      writeSaved('canvas', { scenes: [] })
    })
    const file = await buildProjectFile({ sheetsById: {} })
    stop()
    expect(flushed).toBe(true)
    expect(file).toMatchObject({
      app: 'rgd-generator',
      version: 1,
      canvas: { scenes: [] },
      generator: { text: 'HI' },
      timeline: { sheetsById: {} },
    })
  })

  it('round-trip: parse a saved file and restore its pages into storage', async () => {
    const file = await buildProjectFile()
    file.canvas = { scenes: ['x'] }
    file.generator = { text: 'BACK' }
    const parsed = parseProjectFile(JSON.stringify(file))
    expect(parsed).not.toBeNull()
    writeSaved('canvas', { scenes: [] })
    await restoreProjectFile(parsed as NonNullable<typeof parsed>)
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
      repeat: 0,
      shape: 0,
      twist: 2,
      etch: 3,
      pattern: 5,
      texture: 0,
      material: 0,
      lighting: 0,
      text: 0,
      cluster: 0,
    })
    const pattern = doc.modifiers[2]
    expect(pattern?.kind === 'pattern' && pattern.params.repeats).toBe(3)
    expect(pattern?.kind === 'pattern' && pattern.params.image).toMatch(/ornament-sample/)
    expect(pattern?.kind === 'pattern' && pattern.params.crop).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
    expect(doc.view).toEqual({ x: 5, y: 6, zoom: 0.5 })
  })

  it('round-trips a pattern crop, clamping broken crops inside the image', () => {
    const crop = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }
    const saved = parseCanvasDocument({
      modifiers: [{ id: 'pattern-1', kind: 'pattern', params: { image: '/x.png', crop } }],
    })
    const node = saved.modifiers[0]
    expect(node?.kind === 'pattern' && node.params.crop).toEqual(crop)

    for (const [bad, expected] of [
      [{ x: -1, y: 2, width: 3, height: 0 }, { x: 0, y: 0.98, width: 1, height: 0.02 }],
      [{ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }],
      [undefined, { x: 0, y: 0, width: 1, height: 1 }],
    ] as const) {
      const parsed = parseCanvasDocument({
        modifiers: [{ id: 'pattern-1', kind: 'pattern', params: { image: '/x.png', crop: bad } }],
      })
      const parsedNode = parsed.modifiers[0]
      expect(parsedNode?.kind === 'pattern' && parsedNode.params.crop).toEqual(expected)
    }
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

describe('legacy large values stored apart', () => {
  it('stores a blob once by content, loads it back, and passes plain values through', async () => {
    const { loadBlob } = await import('../../src/state')
    const image = 'data:image/png;base64,' + 'A'.repeat(5000)
    const ref = storeBlob(image)
    expect(ref).toMatch(/^rgd-blob:/)
    expect(storeBlob(image)).toBe(ref)
    expect(loadBlob(ref)).toBe(image)
    expect(loadBlob('/images/x.png')).toBe('/images/x.png')
    expect(loadBlob('rgd-blob:missing')).toBeNull()
  })

  it('removes images no longer used', async () => {
    const { loadBlob, pruneBlobs } = await import('../../src/state')
    const keep = storeBlob('data:keep')
    const drop = storeBlob('data:drop')
    pruneBlobs(new Set([keep]))
    expect(loadBlob(keep)).toBe('data:keep')
    expect(loadBlob(drop)).toBeNull()
  })
})

describe('image assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setImageAssetStore(null)
    clearImageAssetCaches()
  })

  it('fit imported images to 5000 px on the long edge: proportions kept, never upscaled', () => {
    expect(fittedSize(6000, 3000)).toEqual({ width: 5000, height: 2500 })
    expect(fittedSize(3000, 6000)).toEqual({ width: 2500, height: 5000 })
    expect(fittedSize(1200, 800)).toEqual({ width: 1200, height: 800 })
    expect(fittedSize(100, 10000)).toEqual({ width: 50, height: 5000 })
  })

  it('stores images in IndexedDB and reads them back after a session cache reset', async () => {
    freshIndexedDb()
    const ref = await storeImageAsset(IMAGE)
    expect(ref).toMatch(new RegExp(`^${ASSET_PREFIX}`))
    expect(await loadImageAsset(ref)).toBe(IMAGE)

    // A reload: no session cache, the same browser database.
    clearImageAssetCaches()
    setImageAssetStore(null)
    expect(await loadImageAsset(ref)).toBe(IMAGE)
  })

  it('stores shared images once by content and prunes only unused assets', async () => {
    freshIndexedDb()
    const a = await storeImageAsset(IMAGE)
    const b = await storeImageAsset(IMAGE)
    expect(b).toBe(a)
    const other = await storeImageAsset('data:image/png;base64,OTHER')
    await pruneImageAssets(new Set([a]))
    expect(await loadImageAsset(a)).toBe(IMAGE)
    expect(await loadImageAsset(other)).toBeNull()
  })

  it('migrates legacy localStorage blobs into IndexedDB without deleting the durable copy', async () => {
    freshIndexedDb()
    const image = 'data:image/png;base64,' + 'L'.repeat(5000)
    const legacyRef = storeBlob(image)
    expect(legacyRef).toMatch(/^rgd-blob:/)
    const legacyKey = `rgd-generator:blob:${legacyRef.slice('rgd-blob:'.length)}`
    expect(window.localStorage.getItem(legacyKey)).toBe(image)

    expect(await loadImageAsset(legacyRef)).toBe(image)
    // Migrated: the same content is now an IndexedDB asset...
    clearImageAssetCaches()
    setImageAssetStore(null)
    expect(await loadImageAsset(legacyRef)).toBe(image)
    // ...and the legacy copy is still there for older saves.
    expect(window.localStorage.getItem(legacyKey)).toBe(image)
  })

  it('migrates embedded data URLs in saved documents into IndexedDB', async () => {
    freshIndexedDb()
    const doc = patternDocument()
    const hydrated = await hydrateCanvasDocument(doc)
    const node = hydrated.document.modifiers[0]
    expect(node?.kind === 'pattern' && node.params.image).toBe(IMAGE)
    expect(hydrated.missing).toEqual([])

    const stored = await storeCanvasDocument(doc)
    const savedNode = stored.modifiers[0]
    expect(savedNode?.kind === 'pattern' && savedNode.params.image).toMatch(/^rgd-asset:/)
    expect(JSON.stringify(stored)).not.toContain(IMAGE)
    expect(await loadImageAsset((savedNode as { params: { image: string } }).params.image)).toBe(
      IMAGE,
    )
  })

  it('hydrates stored assets asynchronously and reports missing ones honestly', async () => {
    freshIndexedDb()
    const ref = await storeImageAsset(IMAGE)
    const doc = patternDocument(ref)
    clearImageAssetCaches()
    setImageAssetStore(null)
    const hydrated = await hydrateCanvasDocument(doc)
    const node = hydrated.document.modifiers[0]
    expect(node?.kind === 'pattern' && node.params.image).toBe(IMAGE)

    const missing = patternDocument('rgd-asset:missing')
    const result = await hydrateCanvasDocument(missing)
    const missingNode = result.document.modifiers[0]
    expect(result.missing).toEqual(['rgd-asset:missing'])
    // The reference is kept: a save must not silently drop it.
    expect(missingNode?.kind === 'pattern' && missingNode.params.image).toBe('rgd-asset:missing')
  })

  it('saves portable files with embedded images and opens them in a clean store', async () => {
    const first = freshIndexedDb()
    const doc = patternDocument()
    const stored = await storeCanvasDocument(doc)
    writeSaved('canvas', stored)

    const file = await buildProjectFile()
    expect(JSON.stringify(file)).toContain(IMAGE)

    // A different browser profile: new empty IndexedDB and no canvas document in storage.
    window.localStorage.clear()
    freshIndexedDb()
    await restoreProjectFile(file)
    const reopened = readSaved('canvas') as { modifiers: Array<{ params: { image: string } }> }
    // The lightweight document refers to the IndexedDB asset, written before the document.
    expect(reopened.modifiers[0]?.params.image).toMatch(/^rgd-asset:/)
    expect(await loadImageAsset(reopened.modifiers[0]!.params.image)).toBe(IMAGE)
    const hydrated = await hydrateCanvasDocument(parseCanvasDocument(reopened))
    const node = hydrated.document.modifiers[0]
    expect(node?.kind === 'pattern' && node.params.image).toBe(IMAGE)
    expect(first).not.toBe(globalThis.indexedDB)
  })

  it('awaits asset writes before reporting the document saved', async () => {
    freshIndexedDb()
    const writes: string[] = []
    setImageAssetStore({
      read: async () => null,
      write: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        writes.push(id)
      },
      remove: async () => {},
      keys: async () => [],
    })
    clearImageAssetCaches()
    const stored = await storeCanvasDocument(patternDocument())
    const node = stored.modifiers[0]
    expect(node?.kind === 'pattern' && node.params.image).toMatch(/^rgd-asset:/)
    expect(writes).toHaveLength(1)
  })

  it('refuses to inline a project with a missing image instead of saving a broken file', async () => {
    freshIndexedDb()
    await expect(inlineImageAssets({ image: 'rgd-asset:missing' })).rejects.toThrow(
      /Missing image asset/,
    )
  })
})
