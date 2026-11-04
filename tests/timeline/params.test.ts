import { DEFAULT_SCENE_PARAMS, DEFAULT_SETTINGS } from '../../src/state'
import {
  changedLeaves,
  fromTimelineValues,
  hexToRgba,
  leafAt,
  PARAM_PATHS,
  rgbaToHex,
  toTimelineValues,
} from '../../src/timeline/params'
import type { AnimatedParams } from '../../src/types'

const { fontSize, lineHeight, columnWidth, material } = DEFAULT_SETTINGS
const params: AnimatedParams = {
  fontSize,
  lineHeight,
  columnWidth,
  material,
  ...DEFAULT_SCENE_PARAMS,
}

describe('timeline params', () => {
  it('round-trips the app params through timeline values', () => {
    expect(fromTimelineValues(toTimelineValues(params), params)).toEqual(params)
  })

  it('has a value at every path', () => {
    const values = toTimelineValues(params)
    for (const path of PARAM_PATHS) expect(leafAt(values, path)).toBeDefined()
  })

  it('converts colors between hex and rgba', () => {
    expect(hexToRgba('#ff8000')).toEqual({ r: 1, g: 128 / 255, b: 0, a: 1 })
    expect(rgbaToHex({ r: 1, g: 128 / 255, b: 0, a: 1 })).toBe('#ff8000')
    // Interpolated values round to the nearest byte, and clamp.
    expect(rgbaToHex({ r: 0.5, g: 1.2, b: -1, a: 1 })).toBe('#80ff00')
  })

  it('lists exactly the props an edit changed, with their new values', () => {
    const before = toTimelineValues(params)
    const after = toTimelineValues({
      ...params,
      // The size slider scales line height too: the leading stays, only the size changes.
      fontSize: 60,
      lineHeight: 60,
      lineBox: { ...params.lineBox, padY: 20 },
      canvasColors: { ...params.canvasColors, background: '#000000' },
    })
    expect(changedLeaves(before, after)).toEqual([
      ['type.size', 60],
      ['lineBoxes.padY', 20],
      ['canvas.background', { r: 0, g: 0, b: 0, a: 1 }],
    ])
    expect(changedLeaves(before, before)).toEqual([])
  })

  it('keeps the palette color count from the app (the timeline holds eight)', () => {
    const three = {
      ...params,
      material: { ...material, customColors: ['#000000', '#808080', '#ffffff'] },
    }
    const values = toTimelineValues(three)
    // Unused slots repeat the last color.
    expect(rgbaToHex(values.material.colors.c8)).toBe('#ffffff')
    expect(fromTimelineValues(values, three).material.customColors).toEqual([
      '#000000',
      '#808080',
      '#ffffff',
    ])
  })
})
