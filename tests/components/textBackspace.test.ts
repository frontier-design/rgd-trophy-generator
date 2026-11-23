import {
  DEFAULT_BACKSPACE,
  parseTextParams,
  prefixText,
  textAt,
  textDuration,
  textSegments,
  typedText,
} from '../../src/components/CanvasPage/textLines'

const lines = [
  { text: 'AB', speed: 2, tracking: 0 },
  { text: 'C😀', speed: 4, tracking: 0 },
]

it('shows the first characters typed, as the typing does partway', () => {
  expect(prefixText(lines, 0)).toBe('')
  expect(prefixText(lines, 1)).toBe('A')
  // A finished line's break comes with it, as when typing.
  expect(prefixText(lines, 2)).toBe('AB\nC'.slice(0, 3))
  expect(prefixText(lines, 2)).toBe(typedText(lines, 1))
  expect(prefixText(lines, 4)).toBe('AB\nC😀')
  expect(prefixText(lines, 99)).toBe('AB\nC😀')
})

it('types, then (backspace on) pauses on the whole text and deletes it from the end', () => {
  // Typing: 1 s, then 0.5 s.
  expect(textDuration({ lines })).toBe(1.5)
  expect(textAt({ lines }, 99)).toBe('AB\nC😀')
  const backspace = { enabled: true, pause: 1, speed: 4 }
  const params = { lines, backspace }
  expect(textSegments(params)).toEqual([
    { kind: 'line', index: 0, start: 0, end: 1 },
    { kind: 'line', index: 1, start: 1, end: 1.5 },
    { kind: 'pause', start: 1.5, end: 2.5 },
    { kind: 'delete', start: 2.5, end: 3.5 },
  ])
  expect(textDuration(params)).toBe(3.5)
  expect(textAt(params, -1)).toBe('')
  expect(textAt(params, 0.5)).toBe('A')
  expect(textAt(params, 2)).toBe('AB\nC😀')
  // One character a quarter second, the emoji as one.
  expect(textAt(params, 2.5)).toBe('AB\nC😀')
  expect(textAt(params, 2.75)).toBe('AB\nC')
  expect(textAt(params, 3)).toBe('AB\n')
  expect(textAt(params, 3.25)).toBe('A')
  expect(textAt(params, 3.5)).toBe('')
  expect(textAt(params, 99)).toBe('')
  // Off: typing only.
  expect(textAt({ lines, backspace: { ...backspace, enabled: false } }, 3)).toBe('AB\nC😀')
})

it('loads a saved backspace within its ranges, and none for older nodes', () => {
  const saved = { lines, backspace: { enabled: true, pause: -2, speed: 999 } }
  expect(parseTextParams(saved, '').backspace).toEqual({ enabled: true, pause: 0, speed: 60 })
  expect(parseTextParams({ lines }, '').backspace).toBeUndefined()
  expect(parseTextParams({ lines, backspace: {} }, '').backspace).toEqual({
    ...DEFAULT_BACKSPACE,
    enabled: false,
  })
})
