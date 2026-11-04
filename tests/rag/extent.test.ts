import { fillExtent, lineBaseline, lineBoxes, shapeExtent } from '../../src/rag'

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
      bandBottom: -4, // the band ends at the first box's top
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

describe('fillExtent', () => {
  const extent = { left: 0, top: -20, bandBottom: 0, bottom: 300 }
  // The text block 60px in from a 1000 × 500 frame's left and top.
  const frame = { left: -60, top: -60, right: 940, bottom: 440 }

  it('covers the frame once revolved at 1, keeping the band bottom', () => {
    // Edge 440: 500 to the frame's left, 500 to its right.
    expect(fillExtent(extent, frame, 440, 1)).toEqual({
      left: -60,
      top: -60,
      bandBottom: 0,
      bottom: 440,
    })
  })

  it('reaches the farther side when the edge is off center', () => {
    // Edge 300: 360 to the left, 640 to the right.
    expect(fillExtent(extent, frame, 300, 1).left).toBe(300 - 640)
  })

  it('is the extent at 0 and goes part way in between', () => {
    expect(fillExtent(extent, frame, 440, 0)).toBe(extent)
    expect(fillExtent(extent, frame, 440, 0.5)).toEqual({
      left: -30,
      top: -40,
      bandBottom: 0,
      bottom: 370,
    })
  })

  it('never shrinks a side already past the frame', () => {
    const big = { left: -100, top: -100, bottom: 600 }
    expect(fillExtent(big, frame, 440, 1)).toEqual(big)
  })
})
