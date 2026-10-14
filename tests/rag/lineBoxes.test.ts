import { lineBoxes } from '../../src/rag'

const lines = [
  { index: 0, text: 'RGD', width: 30 },
  { index: 1, text: '', width: 0 },
]

describe('lineBoxes', () => {
  it('matches the measured line boxes with no padding', () => {
    expect(lineBoxes(lines, { lineHeight: 10, padX: 0, padY: 0, radius: 0 })).toEqual([
      { lineIndex: 0, x: 0, y: 0, width: 30, height: 10, radius: 0 },
      { lineIndex: 1, x: 0, y: 10, width: 0, height: 10, radius: 0 },
    ])
  })

  it('grows by padding on every side', () => {
    const [box] = lineBoxes(lines, { lineHeight: 10, padX: 4, padY: 2, radius: 0 })
    expect(box).toMatchObject({ x: -4, y: -2, width: 38, height: 14 })
  })

  it('never goes below zero size and clamps the radius to fit', () => {
    const [, empty] = lineBoxes(lines, { lineHeight: 10, padX: -5, padY: -8, radius: 50 })
    expect(empty).toMatchObject({ width: 0, height: 0, radius: 0 })
    const [box] = lineBoxes(lines, { lineHeight: 10, padX: 0, padY: 0, radius: 50 })
    expect(box?.radius).toBe(5)
  })
})
