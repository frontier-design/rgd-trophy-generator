import { createModifier, createSceneModifiersResolver } from '../../src/components/CanvasPage/graph'
import {
  loadCanvasDocument,
  parseCanvasDocument,
  storeCanvasDocument,
} from '../../src/components/CanvasPage/canvasDocument'
import { readSaved, writeSaved } from '../../src/state/persist'
import {
  copySelection,
  pasteSelection,
  replaceSelection,
} from '../../src/components/CanvasPage/selection'

describe('text nodes', () => {
  it('resolves shared text, last link wins, and updates immutably', () => {
    const a = {
      ...createModifier('text', 'text-1', 'text 1', 0, 0),
      kind: 'text' as const,
      params: { text: 'first' },
    }
    const b = { ...a, id: 'text-2', params: { text: '' } }
    const links = [
      { from: a.id, to: 's1' },
      { from: b.id, to: 's1' },
      { from: a.id, to: 's2' },
    ]
    const resolve = createSceneModifiersResolver()
    expect(resolve(links, [a, b], new Map()).get('s1')?.text).toBe('')
    expect(resolve(links, [a, b], new Map()).get('s2')?.text).toBe('first')
    expect(
      resolve(links, [{ ...a, params: { text: 'updated' } }, b], new Map()).get('s2')?.text,
    ).toBe('updated')
    expect(resolve(links.slice(0, 1), [a, b], new Map()).get('s1')?.text).toBe('first')
  })

  it('round-trips counters through autosave and recovers missing or corrupt legacy counters', async () => {
    const node = createModifier('text', 'text-4', 'text 4', 0, 0)
    const legacy = parseCanvasDocument({ modifiers: [node], inserted: { text: null } })
    expect(legacy.inserted.text).toBe(4)
    expect(
      writeSaved(
        'canvas',
        await storeCanvasDocument({ ...legacy, inserted: { ...legacy.inserted, text: 9 } }),
      ),
    ).toBe(true)
    expect(loadCanvasDocument().inserted.text).toBe(9)
    expect((readSaved('canvas') as { inserted: { text: number } }).inserted.text).toBe(9)

    for (const invalid of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(
        parseCanvasDocument({ modifiers: [node], inserted: { text: invalid } }).inserted.text,
      ).toBe(4)
    }
    const hugeId = { ...node, id: `text-${'9'.repeat(400)}` }
    expect(parseCanvasDocument({ modifiers: [hugeId], inserted: {} }).inserted.text).toBe(0)
    window.localStorage.removeItem('rgd-generator:canvas')
  })

  it('persists and copies text nodes, including legacy counters', () => {
    const node = {
      ...createModifier('text', 'text-4', 'text 4', 12, 34),
      params: { text: 'hello\nworld' },
    }
    const doc = parseCanvasDocument({ modifiers: [node], inserted: {} })
    expect(doc.modifiers[0]).toEqual(node)
    expect(doc.inserted.text).toBe(4)
    const copy = copySelection(replaceSelection([node.id]), [], doc.modifiers, [])
    const pasted = pasteSelection(copy, doc.inserted, { offset: { x: 10, y: 10 } })
    expect(pasted.modifiers[0]).toMatchObject({ id: 'text-5', params: { text: 'hello\nworld' } })
    expect(parseCanvasDocument({}).inserted.text).toBe(0)
  })
})
