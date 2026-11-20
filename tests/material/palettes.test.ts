import {
  hexToRgb,
  LEGACY_PALETTES,
  materialStops,
  migratePalette,
  MAX_STOPS,
  PALETTE_NAMES,
  paletteColors,
  paletteGradient,
  PALETTES,
  paletteStops,
  stopsFromColors,
} from '../../src/material'
import type { PaletteName } from '../../src/types'

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
  it('are the RGD scenes’ color sets, each with at least 3 stops', () => {
    expect(PALETTE_NAMES).toEqual(['studio', 'slate', 'gold', 'silver', 'bronze', 'rose', 'pewter'])
    for (const name of PALETTE_NAMES) expect(PALETTES[name].length).toBeGreaterThanOrEqual(3)
  })

  it('spaces stops evenly from top (0) to bottom (1)', () => {
    const stops = paletteStops('slate')
    expect(stops.map((s) => s.position)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(stops[0]?.color).toEqual(hexToRgb(PALETTES.slate[0]!))
  })
})

describe('custom palettes', () => {
  const customColors = ['#000000', '#ffffff']

  it('paletteColors picks the preset or the custom colors', () => {
    expect(paletteColors({ palette: 'gold', customColors })).toBe(PALETTES.gold)
    expect(paletteColors({ palette: 'custom', customColors })).toBe(customColors)
  })

  it('falls back to the default preset if the custom list is empty', () => {
    expect(paletteColors({ palette: 'custom', customColors: [] })).toBe(PALETTES.studio)
  })

  it('loads a removed preset as a custom palette of its colors', () => {
    expect(migratePalette({ palette: 'ember' as PaletteName, customColors: [] })).toEqual({
      palette: 'custom',
      customColors: [...LEGACY_PALETTES.ember!],
    })
    expect(migratePalette({ palette: 'nope' as PaletteName, customColors: [] }).palette).toBe(
      'studio',
    )
    const current = { palette: 'gold' as const, customColors: [] }
    expect(migratePalette(current)).toBe(current)
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

describe('paletteGradient', () => {
  it('lays a palette out left to right, or is one color', () => {
    expect(paletteGradient(['#000000', '#ffffff'])).toBe('linear-gradient(90deg, #000000, #ffffff)')
    expect(paletteGradient(['#123456'])).toBe('#123456')
  })
})
