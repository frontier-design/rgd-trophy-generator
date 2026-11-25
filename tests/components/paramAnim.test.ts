import {
  modifiersByScene,
  type ModifierNode,
  type NodeLink,
} from '../../src/components/CanvasPage/graph'
import { DEFAULT_TWIST } from '../../src/components/CanvasPage/graph'
import {
  animatedParams,
  ease,
  moveKeyframe,
  parseAnims,
  removeKeyframe,
  routeEdit,
  setKeyframe,
  setKeyframeEasing,
  trackValue,
  type ParamTrack,
} from '../../src/components/CanvasPage/paramAnim'

const track = (...keys: [number, number][]): ParamTrack => ({
  keyframes: keys.map(([time, value]) => ({ time, value })),
})

it('holds the first value before the first keyframe and the last after the last, easing between', () => {
  const t = track([1, 10], [3, 30])
  expect(trackValue(t, 0)).toBe(10)
  expect(trackValue(t, 1)).toBe(10)
  expect(trackValue(t, 2)).toBeCloseTo(20) // ease: halfway is halfway
  expect(trackValue(t, 1.5)).toBeCloseTo(10 + 20 * ease('ease', 0.25))
  expect(trackValue(t, 3)).toBe(30)
  expect(trackValue(t, 9)).toBe(30)
  expect(trackValue({ keyframes: [] }, 1)).toBeUndefined()
  // Three keyframes: each stretch its own.
  const three = track([0, 0], [1, 10], [2, 0])
  expect(trackValue(three, 1)).toBe(10)
  expect(trackValue(three, 1.5)).toBeCloseTo(5)
})

it("moves by each keyframe's easing to the next: linear, fast ones early, hold until the next", () => {
  const base = track([0, 0], [1, 100])
  expect(trackValue(setKeyframeEasing(base, 0, 'linear'), 0.25)).toBeCloseTo(25)
  expect(trackValue(setKeyframeEasing(base, 0, 'fast-out'), 0.25)!).toBeGreaterThan(75)
  const hold = setKeyframeEasing(base, 0, 'hold')
  expect(trackValue(hold, 0.99)).toBe(0)
  expect(trackValue(hold, 1)).toBe(100)
  // The default isn't saved.
  expect(setKeyframeEasing(hold, 0, 'ease').keyframes[0]).not.toHaveProperty('easing')
})

it('sets, adds, moves and removes keyframes, keeping them in time order', () => {
  let t = setKeyframe(undefined, 2, 5)
  t = setKeyframe(t, 0.5, 1)
  expect(t.keyframes.map((key) => key.time)).toEqual([0.5, 2])
  // At an existing keyframe's moment, that one changes.
  t = setKeyframe(t, 2.0004, 9)
  expect(t.keyframes).toHaveLength(2)
  expect(t.keyframes[1]?.value).toBe(9)
  // Moving the first past the second reorders them; never before 0.
  const moved = moveKeyframe(t, 0, 3)
  expect(moved.index).toBe(1)
  expect(moved.track.keyframes.map((key) => key.time)).toEqual([2, 3])
  expect(moveKeyframe(t, 1, -4).track.keyframes[0]?.time).toBe(0)
  // Onto another's moment, it stays just after it.
  const onto = moveKeyframe(t, 0, 2)
  expect(onto.index).toBe(1)
  expect(onto.track.keyframes[1]!.time).toBeGreaterThan(2)
  expect(removeKeyframe(t, 0).keyframes.map((key) => key.time)).toEqual([2])
})

it('animates top-level and nested properties at a time, leaving the rest alone', () => {
  const params = { depth: 5, flutes: 12, lineBox: { padX: 10, padY: 4 } }
  const anims = { depth: track([0, 0], [2, 20]), 'lineBox.padX': track([1, 30]) }
  const out = animatedParams(params, anims, 1)
  expect(out.depth).toBeCloseTo(10)
  expect(out.lineBox).toEqual({ padX: 30, padY: 4 })
  expect(out.flutes).toBe(12)
  expect(animatedParams(params, undefined, 1)).toBe(params)
})

it("sends an animated slider's edit to a keyframe at the time, keeping the node's own value", () => {
  const params = { depth: 5, lineBox: { padX: 10, padY: 4 } }
  const anims = { depth: track([0, 0], [2, 20]), 'lineBox.padX': track([0, 30]) }
  const shown = animatedParams(params, anims, 1)
  // Between keyframes: a new one there.
  const edited = routeEdit(params, shown, { depth: 7 }, anims, 1)
  expect(edited.params).toEqual({})
  expect(edited.anims?.depth?.keyframes.map((key) => [key.time, key.value])).toEqual([
    [0, 0],
    [1, 7],
    [2, 20],
  ])
  // On one: that one changes. Nested: the node keeps its own value, its sibling edits go on.
  const nested = routeEdit(params, shown, { lineBox: { padX: 31, padY: 6 } }, anims, 0)
  expect(nested.params).toEqual({ lineBox: { padX: 10, padY: 6 } })
  expect(nested.anims?.['lineBox.padX']?.keyframes).toEqual([{ time: 0, value: 31 }])
  // Unanimated edits pass through.
  expect(routeEdit(params, params, { depth: 3 }, undefined, 0).params).toEqual({ depth: 3 })
})

it('loads saved keyframes in time order, dropping broken ones and old line animations', () => {
  const parsed = parseAnims({
    depth: {
      keyframes: [
        { time: 2, value: 1, easing: 'linear' },
        { time: 0.5, value: 3 },
        { time: 'x', value: 1 },
      ],
    },
    twist: { enabled: true, line: 1, from: 0, to: 10 },
    flutes: { keyframes: [] },
  })
  expect(parsed).toEqual({
    depth: {
      keyframes: [
        { time: 0.5, value: 3 },
        { time: 2, value: 1, easing: 'linear' },
      ],
    },
  })
  expect(parseAnims({ twist: { enabled: true, line: 1, from: 0, to: 10 } })).toBeUndefined()
})

it('every scene sees animated properties at the animation clock’s time, text node or not', () => {
  const twist = {
    id: 'twist-1',
    kind: 'twist',
    name: 'twist 1',
    x: 0,
    y: 0,
    params: { ...DEFAULT_TWIST, depth: 5 },
    anims: { depth: track([0, 0], [2, 40]) },
  } as ModifierNode
  const links: NodeLink[] = [
    { from: 'twist-1', to: 'scene-1' },
    { from: 'twist-1', to: 'scene-2' },
  ]
  const at = (time: number) =>
    [...modifiersByScene(links, [twist], new Map(), time).values()].map((m) => m.twists[0]?.depth)
  expect(at(0)).toEqual([0, 0])
  expect(at(1)?.[0]).toBeCloseTo(20)
  expect(at(5)).toEqual([40, 40])
})
