import { toCanvasFont, toFontLoadQuery } from '../../src/measure'

describe('font strings', () => {
  it('builds a canvas font shorthand', () => {
    expect(toCanvasFont({ fontFamily: 'Arial', fontSize: 18, fontWeight: 400 })).toBe(
      '400 18px "Arial"',
    )
  })

  it('load query does not depend on size', () => {
    expect(toFontLoadQuery({ fontFamily: 'Arial', fontWeight: 700 })).toBe('700 16px "Arial"')
  })
})
