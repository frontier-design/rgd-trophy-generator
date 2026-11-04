import { learnPatterns, random, wfcOverlapping } from '../../src/pattern'

/** A checkerboard of 2 × 2 blocks: every n = 2 neighborhood is one of a few. */
const blocks = (w: number, h: number) =>
  Uint8Array.from({ length: w * h }, (_, i) =>
    (Math.floor((i % w) / 2) + Math.floor(i / w / 2)) % 2 ? 1 : 0,
  )

/** Every n × n window of `grid` (wrapping across if `wrapX`), as strings. */
function windows(grid: Uint8Array, w: number, h: number, n: number, wrapX: boolean) {
  const out = new Set<string>()
  for (let y = 0; y <= h - n; y++) {
    for (let x = 0; x <= (wrapX ? w - 1 : w - n); x++) {
      const cells: number[] = []
      for (let dy = 0; dy < n; dy++)
        for (let dx = 0; dx < n; dx++) cells.push(grid[((x + dx) % w) + (y + dy) * w] ?? 0)
      out.add(cells.join(''))
    }
  }
  return out
}

describe('random', () => {
  it('is seedable: the same seed, the same numbers', () => {
    const a = random(7)
    const b = random(7)
    const values = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(values)
    for (const v of values) expect(v).toBeGreaterThanOrEqual(0)
    expect(random(8)()).not.toBe(values[0])
  })
})

describe('learnPatterns', () => {
  it('finds each distinct neighborhood once, counting repeats as weight', () => {
    const sample = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0])
    const { patterns, weights } = learnPatterns(sample, 3, 3, 2, 1)
    expect(patterns).toHaveLength(1)
    expect(weights).toEqual([4])
  })

  it('adds mirrored and rotated variants with symmetry', () => {
    // An L in a 2 × 2 window: its rotations and reflections are distinct.
    const sample = Uint8Array.from([1, 0, 1, 1])
    expect(learnPatterns(sample, 2, 2, 2, 1).patterns).toHaveLength(1)
    expect(learnPatterns(sample, 2, 2, 2, 2).patterns).toHaveLength(2)
    expect(learnPatterns(sample, 2, 2, 2, 8).patterns).toHaveLength(4)
  })
})

describe('wfcOverlapping', () => {
  it('fills the grid using only the sample’s neighborhoods, wrapping around', () => {
    const sample = blocks(8, 8)
    const result = wfcOverlapping(sample, 8, 8, {
      n: 2,
      symmetry: 1,
      width: 12,
      height: 6,
      periodicX: true,
      seed: 3,
    })
    expect(result).not.toBeNull()
    const out = result?.data ?? new Uint8Array()
    expect(out).toHaveLength(72)
    const allowed = windows(sample, 8, 8, 2, false)
    for (const w of windows(out, 12, 6, 2, true)) expect(allowed.has(w)).toBe(true)
  })

  it('is deterministic for a seed', () => {
    const sample = blocks(8, 8)
    const options = { n: 2, symmetry: 2 as const, width: 10, height: 6, periodicX: true, seed: 11 }
    expect(wfcOverlapping(sample, 8, 8, options)?.data).toEqual(
      wfcOverlapping(sample, 8, 8, options)?.data,
    )
  })

  it('gives up (null) on a sample too small or too varied', () => {
    expect(
      wfcOverlapping(new Uint8Array(4), 2, 2, {
        n: 3,
        symmetry: 1,
        width: 4,
        height: 4,
        periodicX: true,
        seed: 1,
      }),
    ).toBeNull()
    const noise = Uint8Array.from({ length: 400 }, (_, i) => (random(i)() > 0.5 ? 1 : 0))
    expect(
      wfcOverlapping(noise, 20, 20, {
        n: 4,
        symmetry: 8,
        width: 8,
        height: 8,
        periodicX: true,
        seed: 1,
        maxPatterns: 50,
      }),
    ).toBeNull()
  })
})
