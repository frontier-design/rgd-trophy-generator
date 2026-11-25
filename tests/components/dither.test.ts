import { ditherTone } from '../../src/components/CanvasPage/dither'

describe('ditherTone', () => {
  const field = (tone: number) => new Float32Array(16).fill(tone)
  const count = (dots: Uint8Array) => dots.reduce((sum, dot) => sum + dot, 0)

  it('turns tone into that share of dots over a 4 × 4 cell', () => {
    expect(count(ditherTone(field(0), 4))).toBe(0)
    expect(count(ditherTone(field(1), 4))).toBe(16)
    expect(count(ditherTone(field(0.5), 4))).toBe(8)
    expect(count(ditherTone(field(0.25), 4))).toBe(4)
  })

  it('spreads a mid tone evenly (no two dots side by side at 50%)', () => {
    const dots = ditherTone(field(0.5), 4)
    for (let i = 0; i < 16; i++) if (i % 4 < 3) expect(dots[i]! && dots[i + 1]!).toBe(0)
  })
})
