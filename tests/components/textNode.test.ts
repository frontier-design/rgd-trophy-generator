import { createModifier, createSceneModifiersResolver } from '../../src/components/CanvasPage/graph'
import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
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
