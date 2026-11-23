import { measureLines } from '../../src/measure'

const settings = {
  fontFamily: 'Arial',
  fontSize: 18,
  fontWeight: 400,
  columnWidth: 320,
  lineHeight: 26,
}

describe('measureLines', () => {
  it('wraps text into lines no wider than the column', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(4)
    const lines = measureLines(text, settings)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.width).toBeGreaterThan(0)
      expect(line.width).toBeLessThanOrEqual(settings.columnWidth)
    }
  })

  it('keeps hard line breaks with pre-wrap', () => {
    const lines = measureLines('one\ntwo', settings, { prepare: { whiteSpace: 'pre-wrap' } })
    expect(lines.map((l) => l.text.trim())).toEqual(['one', 'two'])
  })
})

describe('measureLines visible width', () => {
  it('excludes trailing whitespace in pre-wrap mode', () => {
    const opts = { prepare: { whiteSpace: 'pre-wrap' } } as const
    const [spaced] = measureLines('abc   ', settings, opts)
    const [plain] = measureLines('abc', settings, opts)
    expect(spaced?.text).toBe('abc   ')
    expect(spaced?.width).toBeCloseTo(plain?.width ?? NaN)
  })
})

describe('measureLines with line tracking', () => {
  const base = {
    fontFamily: 'Arial',
    fontSize: 20,
    fontWeight: 400,
    columnWidth: 400,
    lineHeight: 20,
  }
  const prewrap = { prepare: { whiteSpace: 'pre-wrap' as const } }

  it('breaks lines as untracked text does', () => {
    const text = 'AB\n\nCD EF\n'
    const plain = measureLines(text, base, prewrap)
    // Only the empty line is "tracked": the split path, with no spacing on the others.
    const split = measureLines(text, { ...base, lineTracking: [0, 100, 0, 0] }, prewrap)
    expect(split.map(({ index, text, width }) => ({ index, text, width }))).toEqual(plain)
  })

  it('adds the spacing between letters of tracked lines only', () => {
    const plain = measureLines('ABC\nDE', base, prewrap)
    const tracked = measureLines('ABC\nDE', { ...base, lineTracking: [100, 0] }, prewrap)
    // 100/1000 em at 20 px = 2 px, between 3 letters (not after the last): 4 px.
    expect(tracked[0]!.width).toBeCloseTo(plain[0]!.width + 4, 5)
    expect(tracked[0]!.tracking).toBe(2)
    expect(tracked[1]).toEqual(plain[1])
  })
})
