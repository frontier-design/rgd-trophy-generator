import { generatePalette, hexToOklch, MAX_STOPS, shortestArc } from '../../src/material'

describe('generatePalette', () => {
  const crimson = '#b8262a'

  it('makes MAX_STOPS valid colors by default, or the requested count', () => {
    const colors = generatePalette(crimson)
    expect(colors).toHaveLength(MAX_STOPS)
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    expect(generatePalette(crimson, { stops: 3 })).toHaveLength(3)
  })

  it('runs dark (top) → light (bottom) in perceptually even lightness steps', () => {
    const ls = generatePalette(crimson).map((c) => hexToOklch(c).l)
    const steps = ls.slice(1).map((l, i) => l - ls[i]!)
    for (const step of steps) expect(step).toBeGreaterThan(0)
    const mean = steps.reduce((a, b) => a + b) / steps.length
    for (const step of steps) expect(step).toBeCloseTo(mean, 2)
  })

  it('brackets the seed: its lightness falls inside the ramp', () => {
    const ls = generatePalette(crimson).map((c) => hexToOklch(c).l)
    const seed = hexToOklch(crimson).l
    expect(ls[0]!).toBeLessThan(seed)
    expect(ls.at(-1)!).toBeGreaterThan(seed)
  })

  it('shifts hue: darks toward blue-violet, lights toward warm yellow', () => {
    const colors = generatePalette(crimson)
    const seedHue = hexToOklch(crimson).h
    const top = hexToOklch(colors[0]!).h
    const bottom = hexToOklch(colors.at(-1)!).h
    // Crimson (~27°): the shadow side turns down toward 280° (plum), the light side up
    // toward 95° (orange-coral).
    expect(shortestArc(seedHue, top)).toBeLessThan(-5)
    expect(shortestArc(seedHue, bottom)).toBeGreaterThan(5)
  })

  it('gives a neutral ramp for a gray seed', () => {
    for (const c of generatePalette('#808080')) expect(hexToOklch(c).c).toBeLessThan(0.01)
  })
})

describe('shortestArc', () => {
  it('turns the short way round', () => {
    expect(shortestArc(10, 350)).toBe(-20)
    expect(shortestArc(350, 10)).toBe(20)
    expect(shortestArc(27, 95)).toBe(68)
  })
})
