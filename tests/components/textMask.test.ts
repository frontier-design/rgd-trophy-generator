import { modifiersByScene, type TextNode } from '../../src/components/CanvasPage/graph'
import {
  maskReveal,
  maskTop,
  parseTextParams,
  textMask,
  typedParams,
} from '../../src/components/CanvasPage/textLines'
import { createModifier } from '../../src/components/CanvasPage/graph'

const lines = [
  { text: 'RGD', speed: 8, tracking: 0 },
  { text: '2027', speed: 8, tracking: 0 },
]

it("shows the trophy's top over the last characters: half at the third-last, whole at the second-last", () => {
  // 7 characters: "RGD" + "2027".
  expect(maskReveal(0, 7)).toBe(0)
  expect(maskReveal(4, 7)).toBe(0) // "RGD 2"
  expect(maskReveal(5, 7)).toBe(0.5) // "RGD 20"
  expect(maskReveal(6, 7)).toBe(1) // "RGD 202"
  expect(maskReveal(7, 7)).toBe(1)
  // Short text: from the first character.
  expect(maskReveal(1, 2)).toBe(1)
  expect(maskReveal(0, 0)).toBe(1)
})

it('clips from the first line down while typing, eases up to the top, hides with nothing typed', () => {
  // The first line's box at y = 400, the shape's top at 100, a 1080 px frame.
  expect(maskTop({ typed: 0, total: 7 }, 400, 100, 1080)).toBe(1080)
  expect(maskTop({ typed: 2, total: 7 }, 400, 100, 1080)).toBe(400)
  expect(maskTop({ typed: 5, total: 7 }, 400, 100, 1080)).toBe(250)
  // Whole: no clip at all.
  expect(maskTop({ typed: 6, total: 7 }, 400, 100, 1080)).toBeNull()
  expect(maskTop({ typed: 7, total: 7 }, 400, 100, 1080)).toBeNull()
})

it("gives linked scenes a masking text node's progress (all typed outside a preview)", () => {
  const node: TextNode = {
    ...(createModifier('text', 't', 'text', 0, 0) as TextNode),
    params: { lines, mask: true },
  }
  const links = [{ from: 't', to: 'scene' }]
  expect(modifiersByScene(links, [node]).get('scene')?.mask).toEqual({ typed: 7, total: 7 })
  const preview = { ...node, params: typedParams(node.params, 'RGD\n2') }
  expect(modifiersByScene(links, [preview]).get('scene')).toMatchObject({
    text: 'RGD\n2',
    mask: { typed: 4, total: 7 },
  })
  // Off: no mask.
  expect(textMask({ lines })).toBeNull()
  expect(
    modifiersByScene(links, [{ ...node, params: { lines } }]).get('scene')?.mask,
  ).toBeUndefined()
  // Saved only when on, and never the progress.
  expect(parseTextParams({ lines, mask: true, progress: { typed: 1, total: 7 } }, '')).toEqual({
    lines,
    mask: true,
  })
  expect(parseTextParams({ lines }, '').mask).toBeUndefined()
})
