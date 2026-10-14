import { measureFontMetrics } from '../../src/measure'

describe('measureFontMetrics', () => {
  it('returns a positive ascent and descent that scale with the size', () => {
    const small = measureFontMetrics({ fontFamily: 'Arial', fontSize: 20, fontWeight: 400 })
    const large = measureFontMetrics({ fontFamily: 'Arial', fontSize: 40, fontWeight: 400 })
    expect(small.ascent).toBeGreaterThan(0)
    expect(small.descent).toBeGreaterThan(0)
    expect(large.ascent / small.ascent).toBeCloseTo(2, 1)
  })
})
