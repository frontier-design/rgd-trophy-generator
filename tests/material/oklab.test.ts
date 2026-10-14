import { hexToOklch, oklchToRgb, rgbToHex, rgbToOklch } from '../../src/material'
import { hexToRgb } from '../../src/material'

describe('OKLab / OKLCH', () => {
  it('maps black and white to lightness 0 and 1 with no chroma', () => {
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 4)
    const white = hexToOklch('#ffffff')
    expect(white.l).toBeCloseTo(1, 4)
    expect(white.c).toBeCloseTo(0, 4)
  })

  it.each(['#b8262a', '#0b23c9', '#a6cc5e', '#f08be8', '#7f7f7f'])(
    'round-trips %s through OKLCH',
    (hex) => {
      expect(rgbToHex(oklchToRgb(rgbToOklch(hexToRgb(hex))))).toBe(hex)
    },
  )

  it('reduces chroma (not hue or lightness) to bring out-of-gamut colors into sRGB', () => {
    const wild = { l: 0.6, c: 0.5, h: 150 } // far more chroma than sRGB can show
    const rgb = oklchToRgb(wild)
    for (const v of rgb) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of rgb) expect(v).toBeLessThanOrEqual(1)
    const back = rgbToOklch(rgb)
    expect(back.l).toBeCloseTo(0.6, 2)
    expect(back.h).toBeCloseTo(150, 0)
    expect(back.c).toBeLessThan(0.5)
  })
})
