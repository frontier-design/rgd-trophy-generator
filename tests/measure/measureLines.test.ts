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
