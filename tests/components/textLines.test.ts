import {
  DEFAULT_LINE_SPEED,
  DEFAULT_TRACKING,
  enterAt,
  insertText,
  joinWithNext,
  joinWithPrevious,
  lineTracking,
  linesFromText,
  parseTextParams,
  textOf,
  typedText,
  typingDuration,
  type TextLine,
} from '../../src/components/CanvasPage/textLines'

const line = (text: string, speed = 8, tracking = DEFAULT_TRACKING): TextLine => ({
  text,
  speed,
  tracking,
})

describe('text node lines', () => {
  it('splits text into lines, keeping styles by position', () => {
    const previous = [line('A', 5, 50), line('B', 9, -20)]
    expect(linesFromText('A\nBX\nC', previous)).toEqual([
      previous[0],
      line('BX', 9, -20),
      line('C', 9, -20),
    ])
    expect(linesFromText('')).toEqual([line('', DEFAULT_LINE_SPEED, -3)])
    expect(textOf(linesFromText('a\n\nb'))).toBe('a\n\nb')
  })

  it('reports tracking only when a line is tracked', () => {
    expect(lineTracking([line('a', 8, 0), line('b', 8, 0)])).toBeUndefined()
    expect(lineTracking([line('a', 8, 0), line('b', 8, 20)])).toEqual([0, 20])
  })

  it('loads lines, clamping values, and legacy text', () => {
    expect(parseTextParams({ text: 'X\nY' }, 'd').lines.map((l) => l.text)).toEqual(['X', 'Y'])
    expect(parseTextParams({}, 'd').lines).toEqual([line('d')])
    expect(
      parseTextParams(
        { lines: [{ text: 'a\nb', speed: 999, tracking: -400 }, { speed: 2 }, null] },
        'd',
      ).lines,
    ).toEqual([line('a b', 18, -95)])
    expect(parseTextParams({ lines: [] }, 'd').lines).toEqual([line('d')])
  })

  it('edits like a textarea across lines', () => {
    const lines = [line('one', 4, 10), line('two')]
    // Enter at a line's end goes to the next line; after the last, it makes one.
    expect(enterAt(lines, 0, 3)).toEqual({ lines, caret: { line: 1, offset: 0 } })
    expect(enterAt(lines, 1, 3)).toEqual({
      lines: [...lines, line('')],
      caret: { line: 2, offset: 0 },
    })
    // Elsewhere it splits, both halves keeping the style.
    expect(enterAt(lines, 0, 1).lines).toEqual([line('o', 4, 10), line('ne', 4, 10), lines[1]])
    expect(joinWithPrevious(lines, 1)).toEqual({
      lines: [line('onetwo', 4, 10)],
      caret: { line: 0, offset: 3 },
    })
    expect(joinWithPrevious(lines, 0)).toBeNull()
    expect(joinWithNext(lines, 0)?.lines).toEqual([line('onetwo', 4, 10)])
    expect(joinWithNext(lines, 1)).toBeNull()
    expect(insertText(lines, 0, 1, 2, 'X\r\nY\nZ')).toEqual({
      lines: [line('oX', 4, 10), line('Y', 4, 10), line('Ze', 4, 10), lines[1]],
      caret: { line: 2, offset: 1 },
    })
    expect(insertText(lines, 1, 0, 0, 'ab').caret).toEqual({ line: 1, offset: 2 })
  })

  it('types each line at its own speed', () => {
    const lines = [line('ab', 2), line(''), line('cdef', 4)]
    expect(typingDuration(lines)).toBe(2)
    expect(typedText(lines, 0)).toBe('')
    expect(typedText(lines, 0.5)).toBe('a')
    expect(typedText(lines, 1)).toBe('ab\n\n')
    expect(typedText(lines, 1.5)).toBe('ab\n\ncd')
    expect(typedText(lines, 2)).toBeNull()
  })
})
