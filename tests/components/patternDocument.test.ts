import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'

describe('pattern project compatibility', () => {
  it.each(['generate', 'image'])('converts legacy %s patterns while retaining their image and settings', (mode) => {
    const doc = parseCanvasDocument({ modifiers: [{ id: 'pattern-1', kind: 'pattern', params: { mode, style: 'cut', image: 'data:image/png;base64,YWJj', repeats: 7 } }] })
    const pattern = doc.modifiers[0]
    expect(pattern?.kind).toBe('pattern')
    if (pattern?.kind !== 'pattern') throw new Error('missing pattern')
    expect(pattern.params).toMatchObject({ mode: 'repeat', style: 'raised', image: 'data:image/png;base64,YWJj', repeats: 7 })
    expect(parseCanvasDocument(JSON.parse(JSON.stringify(doc))).modifiers[0]).toEqual(pattern)
  })
})
