import {
  lineWidthsToRagPoints,
  ragPointsToNegativeSpacePolygon,
  ragPointsToPolygon,
  type RagOptions,
} from '../../src/rag'

const options: RagOptions = { lineHeight: 10, columnWidth: 100, align: 'left' }
const lines = [
  { index: 0, text: 'RGD', width: 30 },
  { index: 1, text: 'BRANDING', width: 80 },
]

describe('lineWidthsToRagPoints', () => {
  it('returns no points for no lines', () => {
    expect(lineWidthsToRagPoints([], options)).toEqual([])
  })

  it('steps down the line ends, two points per line', () => {
    expect(lineWidthsToRagPoints(lines, options)).toEqual([
      { x: 30, y: 0, lineIndex: 0 },
      { x: 30, y: 10, lineIndex: 0 },
      { x: 80, y: 10, lineIndex: 1 },
      { x: 80, y: 20, lineIndex: 1 },
    ])
  })
})

describe('rag polygons', () => {
  const points = lineWidthsToRagPoints(lines, options)

  it('closes the text side along x = 0', () => {
    expect(ragPointsToPolygon(points, options).slice(-2)).toEqual([
      { x: 0, y: 20 },
      { x: 0, y: 0 },
    ])
  })

  it('closes the negative space along the column edge', () => {
    expect(ragPointsToNegativeSpacePolygon(points, options)).toEqual([
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 80, y: 10 },
      { x: 80, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 0 },
    ])
  })

  it('is empty without points', () => {
    expect(ragPointsToNegativeSpacePolygon([], options)).toEqual([])
  })
})
