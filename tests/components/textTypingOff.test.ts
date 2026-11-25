import {
  linesFromText,
  parseTextParams,
  textAt,
  textDuration,
  textSegments,
  typedParams,
} from '../../src/components/CanvasPage/textLines'

const lines = linesFromText('AB\nCDE').map((line, i) => (i === 0 ? { ...line, hold: 1 } : line))

describe('typing off', () => {
  it('shows each line whole at its turn, keeping holds and backspace', () => {
    const params = { lines, typing: false, backspace: { enabled: true, pause: 0.5, speed: 10 } }
    expect(textAt(params, 0)).toBe('AB')
    expect(textAt(params, 0.99)).toBe('AB')
    expect(textAt(params, 1)).toBe('AB\nCDE')
    // Then the pause, then deleting at its own speed.
    expect(textAt(params, 1.5)).toBe('AB\nCDE')
    expect(textAt(params, 1.75)).toBe('AB\nC')
    expect(textDuration(params)).toBeCloseTo(1 + 0.5 + 5 / 10)
    expect(
      textSegments(params)
        .filter((s) => s.kind === 'line')
        .map((s) => s.end - s.start),
    ).toEqual([0, 0])
  })

  it('times the lines for animated properties as appearing at once', () => {
    const preview = typedParams({ lines, typing: false }, 'AB', 0)
    expect(preview.progress?.lines?.map((l) => l.first)).toEqual([0, 1])
  })

  it('loads as off only when saved off', () => {
    expect(parseTextParams({ lines, typing: false }, '').typing).toBe(false)
    expect('typing' in parseTextParams({ lines }, '')).toBe(false)
  })
})
