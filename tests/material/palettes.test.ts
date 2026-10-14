import {
  hexToRgb,
  materialStops,
  MAX_STOPS,
  PALETTE_NAMES,
  paletteColors,
  PALETTES,
  paletteStops,
  stopsFromColors,
} from '../../src/material'

describe('hexToRgb', () => {
  it('parses 6- and 3-digit hex into sRGB 0–1', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0])
    expect(hexToRgb('#fff')).toEqual([1, 1, 1])
  })

  it('rejects invalid colors', () => {
    expect(() => hexToRgb('#12345z')).toThrow()
  })
})

describe('palette presets', () => {
  it('include the requested presets, each with at least 3 stops', () => {
    expect(PALETTE_NAMES).toEqual(
      expect.arrayContaining(['ember', 'candy', 'cobalt', 'forest', 'plum']),
    )
    for (const name of PALETTE_NAMES) expect(PALETTES[name].length).toBeGreaterThanOrEqual(3)
  })

  it('spaces stops evenly from top (0) to bottom (1)', () => {
    const stops = paletteStops('ember')
    expect(stops.map((s) => s.position)).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(stops[0]?.color).toEqual(hexToRgb(PALETTES.ember[0]!))
  })
})

describe('custom palettes', () => {
  const customColors = ['#000000', '#ffffff']

  it('paletteColors picks the preset or the custom colors', () => {
    expect(paletteColors({ palette: 'plum', customColors })).toBe(PALETTES.plum)
    expect(paletteColors({ palette: 'custom', customColors })).toBe(customColors)
  })

  it('falls back to the first preset if the custom list is empty', () => {
    expect(paletteColors({ palette: 'custom', customColors: [] })).toBe(PALETTES.ember)
  })

  it('materialStops spaces custom colors evenly, top to bottom', () => {
    expect(materialStops({ palette: 'custom', customColors })).toEqual([
      { position: 0, color: [0, 0, 0] },
      { position: 1, color: [1, 1, 1] },
    ])
  })

  it('caps the stop count at MAX_STOPS (the shader limit)', () => {
    const many = Array.from({ length: MAX_STOPS + 3 }, () => '#123456')
    expect(stopsFromColors(many)).toHaveLength(MAX_STOPS)
  })
})
