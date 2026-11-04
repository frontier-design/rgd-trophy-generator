// Wave Function Collapse, the overlapping model (after Maxim Gumin, github.com/mxgmn/
// WaveFunctionCollapse): learn every n × n neighborhood of a small sample image and how they
// overlap, then fill a new grid so every neighborhood in it is one of the sample's, choosing
// cell by cell where the fewest options remain and propagating what that rules out. Pure
// TypeScript (no DOM): runs in a worker and in tests.

export interface WfcOptions {
  /** Neighborhood size (2–4): bigger keeps larger features, needs a richer sample. */
  n: number
  /** Variants of each neighborhood also allowed: 1 = as in the sample, 2 = and mirrored
   *  left–right, 8 = all rotations and reflections. */
  symmetry: 1 | 2 | 8
  /** The output grid. */
  width: number
  height: number
  /** Wrap left–right (seamless around the trophy). Top and bottom never wrap. */
  periodicX: boolean
  seed: number
  /** Restarts (each with the next seed) after a contradiction. */
  tries?: number
  /** Patterns past this many make the propagator too big: give up (null). */
  maxPatterns?: number
}

export interface WfcResult {
  /** One sample value per output cell, row by row. */
  data: Uint8Array
  /** How many distinct neighborhoods the sample has (with symmetry). */
  patterns: number
  /** The seed that succeeded. */
  seed: number
}

/** A small, fast, seedable PRNG (mulberry32): 0 ≤ x < 1. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Neighbor offsets: left, down, right, up (dx, dy), and each one's opposite. */
const DX = [-1, 0, 1, 0]
const DY = [0, 1, 0, -1]
const OPPOSITE = [2, 3, 0, 1]

type Pattern = Uint8Array

function rotate(p: Pattern, n: number): Pattern {
  const out = new Uint8Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x + y * n] = p[n - 1 - y + x * n] ?? 0
  return out
}

function reflect(p: Pattern, n: number): Pattern {
  const out = new Uint8Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x + y * n] = p[n - 1 - x + y * n] ?? 0
  return out
}

/** Whether `b`, placed (dx, dy) from `a`, agrees with it where they overlap. */
function agrees(a: Pattern, b: Pattern, dx: number, dy: number, n: number): boolean {
  const xmin = Math.max(0, dx)
  const xmax = dx < 0 ? dx + n : n
  const ymin = Math.max(0, dy)
  const ymax = dy < 0 ? dy + n : n
  for (let y = ymin; y < ymax; y++) {
    for (let x = xmin; x < xmax; x++) {
      if (a[x + n * y] !== b[x - dx + n * (y - dy)]) return false
    }
  }
  return true
}

/** The sample's neighborhoods (with symmetry), their counts, and which may sit beside which. */
export function learnPatterns(
  sample: Uint8Array,
  width: number,
  height: number,
  n: number,
  symmetry: 1 | 2 | 8,
) {
  const index = new Map<string, number>()
  const patterns: Pattern[] = []
  const weights: number[] = []
  for (let y = 0; y <= height - n; y++) {
    for (let x = 0; x <= width - n; x++) {
      let p: Pattern = new Uint8Array(n * n)
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) p[dx + dy * n] = sample[x + dx + (y + dy) * width] ?? 0
      }
      // The variants: p, its mirror, then each rotation and its mirror.
      const variants: Pattern[] = [p]
      if (symmetry >= 2) variants.push(reflect(p, n))
      if (symmetry === 8) {
        for (let k = 0; k < 3; k++) {
          p = rotate(p, n)
          variants.push(p, reflect(p, n))
        }
      }
      for (const v of variants) {
        const key = v.join('')
        const i = index.get(key)
        if (i === undefined) {
          index.set(key, patterns.length)
          patterns.push(v)
          weights.push(1)
        } else {
          weights[i] = (weights[i] ?? 0) + 1
        }
      }
    }
  }
  const propagator = DX.map((dx, d) =>
    patterns.map((a) => {
      const list: number[] = []
      patterns.forEach((b, j) => {
        if (agrees(a, b, dx, DY[d] ?? 0, n)) list.push(j)
      })
      return Int32Array.from(list)
    }),
  )
  return { patterns, weights, propagator }
}

/**
 * Fill a `width × height` grid in the style of `sample` (`sampleWidth × sampleHeight` small
 * integer values). Returns null when it can't: the sample has too many neighborhoods, or
 * every try ended in a contradiction (try another seed, a smaller n, or more symmetry).
 */
export function wfcOverlapping(
  sample: Uint8Array,
  sampleWidth: number,
  sampleHeight: number,
  options: WfcOptions,
): WfcResult | null {
  const { n, width, height, periodicX } = options
  if (sampleWidth < n || sampleHeight < n || width < 1 || height < 1) return null
  const { patterns, weights, propagator } = learnPatterns(
    sample,
    sampleWidth,
    sampleHeight,
    n,
    options.symmetry,
  )
  const count = patterns.length
  if (count === 0 || count > (options.maxPatterns ?? 600)) return null

  const cells = width * height
  const wave = new Uint8Array(cells * count)
  const compatible = new Int16Array(cells * count * 4)
  const remaining = new Int32Array(cells)
  const sumWeights = new Float64Array(cells)
  const sumWeightLogs = new Float64Array(cells)
  const entropies = new Float64Array(cells)
  const weightLogs = weights.map((w) => w * Math.log(w))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const totalWeightLog = weightLogs.reduce((a, b) => a + b, 0)
  const startEntropy = Math.log(totalWeight) - totalWeightLog / totalWeight
  const stack = new Int32Array(cells * count * 2)

  const tries = options.tries ?? 10
  for (let attempt = 0; attempt < tries; attempt++) {
    const seed = options.seed + attempt
    const rand = random(seed)
    // Clear: every pattern possible everywhere.
    wave.fill(1)
    for (let i = 0; i < cells; i++) {
      for (let t = 0; t < count; t++) {
        for (let d = 0; d < 4; d++) {
          compatible[(i * count + t) * 4 + d] = propagator[OPPOSITE[d] ?? 0]?.[t]?.length ?? 0
        }
      }
    }
    remaining.fill(count)
    sumWeights.fill(totalWeight)
    sumWeightLogs.fill(totalWeightLog)
    entropies.fill(startEntropy)
    let top = 0
    let contradiction = false

    const ban = (i: number, t: number) => {
      wave[i * count + t] = 0
      for (let d = 0; d < 4; d++) compatible[(i * count + t) * 4 + d] = 0
      stack[top++] = i
      stack[top++] = t
      const w = weights[t] ?? 0
      remaining[i] = (remaining[i] ?? 0) - 1
      sumWeights[i] = (sumWeights[i] ?? 0) - w
      sumWeightLogs[i] = (sumWeightLogs[i] ?? 0) - (weightLogs[t] ?? 0)
      const sum = sumWeights[i] ?? 0
      entropies[i] = sum > 0 ? Math.log(sum) - (sumWeightLogs[i] ?? 0) / sum : 0
      if ((remaining[i] ?? 0) === 0) contradiction = true
    }

    const propagate = () => {
      while (top > 0 && !contradiction) {
        const t1 = stack[--top] ?? 0
        const i1 = stack[--top] ?? 0
        const x1 = i1 % width
        const y1 = Math.floor(i1 / width)
        for (let d = 0; d < 4; d++) {
          let x2 = x1 + (DX[d] ?? 0)
          const y2 = y1 + (DY[d] ?? 0)
          if (y2 < 0 || y2 >= height) continue
          if (x2 < 0 || x2 >= width) {
            if (!periodicX) continue
            x2 = (x2 + width) % width
          }
          const i2 = x2 + y2 * width
          const list = propagator[d]?.[t1]
          if (!list) continue
          for (let k = 0; k < list.length; k++) {
            const t2 = list[k] ?? 0
            const c = (i2 * count + t2) * 4 + d
            compatible[c] = (compatible[c] ?? 0) - 1
            if (compatible[c] === 0 && wave[i2 * count + t2]) ban(i2, t2)
          }
        }
      }
    }

    for (;;) {
      // Observe: the undecided cell with the least entropy (a little noise breaks ties).
      let best = -1
      let min = Infinity
      for (let i = 0; i < cells; i++) {
        if ((remaining[i] ?? 0) <= 1) continue
        const e = (entropies[i] ?? 0) + 1e-6 * rand()
        if (e < min) {
          min = e
          best = i
        }
      }
      if (best < 0) break
      // Collapse it to one pattern, chosen by weight.
      let r = rand() * (sumWeights[best] ?? 0)
      let chosen = 0
      for (let t = 0; t < count; t++) {
        if (!wave[best * count + t]) continue
        r -= weights[t] ?? 0
        chosen = t
        if (r <= 0) break
      }
      for (let t = 0; t < count; t++) if (t !== chosen && wave[best * count + t]) ban(best, t)
      propagate()
      if (contradiction) break
    }
    if (contradiction) continue

    // Each cell shows its pattern's top-left value.
    const data = new Uint8Array(cells)
    for (let i = 0; i < cells; i++) {
      for (let t = 0; t < count; t++) {
        if (wave[i * count + t]) {
          data[i] = patterns[t]?.[0] ?? 0
          break
        }
      }
    }
    return { data, patterns: count, seed }
  }
  return null
}
