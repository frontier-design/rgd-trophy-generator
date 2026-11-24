import {
  createModifier,
  modifiersByScene,
  type TwistNode,
  type TextNode,
} from '../../src/components/CanvasPage/graph'
import {
  ease,
  EASINGS,
  animatedParams,
  animValue,
  parseAnims,
  routeEdit,
  shownParams,
  startAnim,
  valueAt,
  withValueAt,
} from '../../src/components/CanvasPage/paramAnim'
import { deleteWindows, typedParams, textAt } from '../../src/components/CanvasPage/textLines'

const lines = [
  { start: 0, end: 1 },
  { start: 1, end: 3 },
]

it('eases from the from value to the to value over its line, holding either side', () => {
  const anim = { ...startAnim(0), line: 2, from: 10, to: 30 }
  expect(animValue(anim, { time: 0, lines })).toBe(10)
  expect(animValue(anim, { time: 1, lines })).toBe(10)
  // Halfway through line 2's typing: halfway (smoothstep is symmetric).
  expect(animValue(anim, { time: 2, lines })).toBe(20)
  // A quarter in: eased (slower than linear's 15).
  expect(animValue(anim, { time: 1.5, lines })).toBeCloseTo(10 + 20 * 0.15625)
  expect(animValue(anim, { time: 3, lines })).toBe(30)
  expect(animValue(anim, { time: 99, lines })).toBe(30)
  // Before the animation (the record's hold in): from.
  expect(animValue(anim, { time: -1, lines })).toBe(10)
  // A line the text doesn't have: to.
  expect(animValue({ ...anim, line: 5 }, { time: 0, lines })).toBe(30)
  // At rest: the value its slider edits.
  expect(animValue(anim, null)).toBe(30)
  expect(animValue({ ...anim, editing: 'from' }, null)).toBe(10)
})

it('animates top-level and nested properties, leaving others (and unanimated params) alone', () => {
  const params = { depth: 5, twist: 0, lineBox: { padX: 1, padY: 2 } }
  expect(valueAt(params, 'lineBox.padY')).toBe(2)
  expect(withValueAt(params, 'lineBox.padY', 9)).toEqual({
    ...params,
    lineBox: { padX: 1, padY: 9 },
  })
  const anims = {
    depth: { ...startAnim(5), from: 0, to: 10 },
    'lineBox.padY': { ...startAnim(2), from: 2, to: 6 },
    twist: { ...startAnim(0), enabled: false, to: 99 },
  }
  expect(animatedParams(params, anims, { time: 0.5, lines })).toEqual({
    depth: 5,
    twist: 0,
    lineBox: { padX: 1, padY: 4 },
  })
  expect(animatedParams(params, undefined, { time: 0.5, lines })).toBe(params)
  expect(shownParams(params, anims)).toEqual({ depth: 10, twist: 0, lineBox: { padX: 1, padY: 6 } })
})

it("sends an animated slider's edits to its from or to value, keeping the node's own", () => {
  const params = { depth: 5, twist: 0, lineBox: { padX: 1, padY: 2 } }
  const anims = {
    depth: { ...startAnim(5), editing: 'from' as const },
    'lineBox.padY': startAnim(2),
  }
  const shown = shownParams(params, anims)
  expect(routeEdit(params, shown, { depth: 7 }, anims)).toEqual({
    params: {},
    anims: { ...anims, depth: { ...anims.depth, from: 7 } },
  })
  // A nested edit: padX (not animated) goes to the params, padY's own value stays.
  const edit = routeEdit(params, shown, { lineBox: { ...shown.lineBox, padX: 3 } }, anims)
  expect(edit.params).toEqual({ lineBox: { padX: 3, padY: 2 } })
  expect(edit.anims).toBe(anims)
  expect(routeEdit(params, shown, { lineBox: { ...shown.lineBox, padY: 8 } }, anims)).toEqual({
    params: { lineBox: { padX: 1, padY: 2 } },
    anims: { ...anims, 'lineBox.padY': { ...anims['lineBox.padY'], to: 8 } },
  })
  // Unanimated: straight through.
  expect(routeEdit(params, shown, { twist: 4 }, anims).params).toEqual({ twist: 4 })
})

it('loads saved animations, dropping broken ones', () => {
  expect(
    parseAnims({
      depth: { enabled: true, line: 2.4, from: 1, to: 2, editing: 'from' },
      twist: { enabled: true, from: 'x', to: 2 },
      flutes: { from: 1, to: 2, line: -3 },
    }),
  ).toEqual({
    depth: { enabled: true, line: 2, from: 1, to: 2, editing: 'from' },
    flutes: { enabled: false, line: 1, from: 1, to: 2, editing: 'to' },
  })
  expect(parseAnims({})).toBeUndefined()
  expect(parseAnims('x')).toBeUndefined()
})

it("each scene's modifiers follow that scene's text node's timing", () => {
  const text = createModifier('text', 'text-1', 'text 1', 0, 0) as TextNode
  text.params = {
    lines: [
      { text: 'AB', speed: 2, tracking: 0 },
      { text: 'CD', speed: 1, tracking: 0 },
    ],
  }
  const twist = createModifier('twist', 'twist-1', 'twist 1', 0, 0) as TwistNode
  twist.anims = { depth: { ...startAnim(0), line: 2, from: 0, to: 20 } }
  const links = [
    { from: 'twist-1', to: 'a' },
    { from: 'text-1', to: 'a' },
    { from: 'twist-1', to: 'b' },
  ]
  const at = (time: number) => {
    const preview = { ...text, params: typedParams(text.params, textAt(text.params, time), time) }
    return modifiersByScene(links, [twist, preview])
  }
  // Line 2 types from 1 s to 3 s.
  expect(at(0.5).get('a')?.twists[0]?.depth).toBe(0)
  expect(at(2).get('a')?.twists[0]?.depth).toBe(10)
  expect(at(3).get('a')?.twists[0]?.depth).toBe(20)
  // Scene b has no text node: at rest (the to value, which the slider edits).
  expect(at(2).get('b')?.twists[0]?.depth).toBe(20)
  // At rest the same params object comes back each time (scenes don't re-render).
  const rest = modifiersByScene(links, [twist, text]).get('a')!.twists[0]
  expect(modifiersByScene(links, [twist, text]).get('a')!.twists[0]).toBe(rest)
})

it('eases by its easing: fast ones do most of the change early, hold jumps when the line is typed', () => {
  expect(EASINGS).toEqual(['ease', 'linear', 'fast-out', 'fast-in-out', 'hold'])
  for (const easing of EASINGS) {
    expect(ease(easing, 0)).toBe(0)
    expect(ease(easing, 1)).toBe(1)
  }
  expect(ease('linear', 0.25)).toBe(0.25)
  expect(ease('ease', 0.5)).toBe(0.5)
  // Fast out: 97% done a third of the way in.
  expect(ease('fast-out', 1 / 3)).toBeGreaterThan(0.89)
  expect(ease('fast-out', 0.5)).toBeGreaterThan(0.96)
  // Fast in-out: barely moving at a quarter, nearly there at three quarters.
  expect(ease('fast-in-out', 0.25)).toBeLessThan(0.02)
  expect(ease('fast-in-out', 0.5)).toBe(0.5)
  expect(ease('fast-in-out', 0.75)).toBeGreaterThan(0.98)
  // Hold: from until the line is typed, then to.
  expect(ease('hold', 0.99)).toBe(0)
  const anim = { ...startAnim(0), line: 2, from: 10, to: 30, easing: 'hold' as const }
  expect(animValue(anim, { time: 2.9, lines })).toBe(10)
  expect(animValue(anim, { time: 3, lines })).toBe(30)
  // Saved: kept when known (the default isn't written), dropped otherwise.
  expect(parseAnims({ a: { from: 0, to: 1, easing: 'hold' } })?.a?.easing).toBe('hold')
  expect(parseAnims({ a: { from: 0, to: 1, easing: 'bounce' } })?.a?.easing).toBeUndefined()
  expect(parseAnims({ a: { from: 0, to: 1, easing: 'ease' } })?.a?.easing).toBeUndefined()
})

it('goes back from to to from while backspace deletes its line, the last line first', () => {
  const params = {
    lines: [
      { text: 'AB', speed: 2, tracking: 0 },
      { text: 'CDEF', speed: 4, tracking: 0 },
    ],
    backspace: { enabled: true, pause: 1, speed: 2 },
  }
  // Typed by 2 s, a 1 s pause, then deleting at 2 a second from 3 s: line 2's four
  // characters first (3–5 s), then line 1's two (5–6 s).
  expect(deleteWindows(params)).toEqual([
    { start: 5, end: 6 },
    { start: 3, end: 5 },
  ])
  expect(deleteWindows({ ...params, backspace: { ...params.backspace, enabled: false } })).toEqual(
    [],
  )
  const timing = (time: number) => {
    const progress = typedParams(params, textAt(params, time), time).progress!
    return { time, lines: progress.lines!, deletes: progress.deletes }
  }
  const line2 = { ...startAnim(0), line: 2, from: 10, to: 30, easing: 'linear' as const }
  expect(animValue(line2, timing(2))).toBe(30)
  // The pause: still to.
  expect(animValue(line2, timing(2.5))).toBe(30)
  // Halfway through deleting line 2: halfway back.
  expect(animValue(line2, timing(4))).toBe(20)
  expect(animValue(line2, timing(5))).toBe(10)
  // Line 1 is still whole while line 2 goes, then goes back itself.
  const line1 = { ...line2, line: 1 }
  expect(animValue(line1, timing(4))).toBe(30)
  expect(animValue(line1, timing(5.5))).toBe(20)
  expect(animValue(line1, timing(9))).toBe(10)
  // Hold: to from line 2's first letter (2 s typing line 1, then a quarter second for "C")
  // until its last letter is deleted (5 s), from before and after.
  const hold = { ...line2, easing: 'hold' as const }
  expect(animValue(hold, timing(1.1))).toBe(10)
  expect(animValue(hold, timing(1.2))).toBe(10)
  expect(animValue(hold, timing(1.25))).toBe(30)
  expect(animValue(hold, timing(3.1))).toBe(30)
  expect(animValue(hold, timing(4.9))).toBe(30)
  expect(animValue(hold, timing(5))).toBe(10)
  // And it lines up with the text: "C" appears at the switch, line 2 is empty at the end.
  expect(textAt(params, 1.25)).toBe('AB\nC')
  expect(textAt(params, 5)).toBe('AB\n')
})
