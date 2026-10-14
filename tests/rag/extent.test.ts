import { lineBaseline, lineBoxes, shapeExtent } from '../../src/rag'

const metrics = { ascent: 30, descent: 10 } // content area 40px

describe('lineBaseline', () => {
  it('is half the leading plus the ascent below the line top', () => {
    // 50px lines: leading 10 → 5 above the content area; baseline 5 + 30 = 35.
    expect(lineBaseline(0, 50, metrics)).toBe(35)
    expect(lineBaseline(2, 50, metrics)).toBe(135)
  })

  it('handles line heights tighter than the font (negative leading)', () => {
    expect(lineBaseline(0, 30, metrics)).toBe(25)
  })
})

describe('shapeExtent', () => {
  const lines = [
    { index: 0, text: 'RGD', width: 30 },
    { index: 1, text: '2027', width: 40 },
  ]

  it("runs from the text's left side and the top band down to the last baseline", () => {
    const boxes = lineBoxes(lines, { lineHeight: 50, padX: 8, padY: 4, radius: 0 })
    expect(shapeExtent(boxes, lines, { lineHeight: 50, topHeight: 20, metrics })).toEqual({
      left: 0, // not the padded boxes' -8
      top: -4 - 20, // first box top (padY 4 above line 0), raised by the band
      bottom: 85, // line 1's baseline, not its box bottom (100 + 4)
    })
  })

  it('extends the bottom below the last baseline by the overshoot', () => {
    const boxes = lineBoxes(lines, { lineHeight: 50, padX: 0, padY: 0, radius: 0 })
    const extent = shapeExtent(boxes, lines, {
      lineHeight: 50,
      topHeight: 0,
      overshoot: 5,
      metrics,
    })
    expect(extent?.bottom).toBe(85 + 5)
  })

  it('is null without text', () => {
    expect(shapeExtent([], [], { lineHeight: 50, topHeight: 0, metrics })).toBeNull()
  })
})
