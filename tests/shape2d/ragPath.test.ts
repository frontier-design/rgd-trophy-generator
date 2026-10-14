import paper from 'paper'
import { ragPolygonToPath } from '../../src/shape2d'

describe('ragPolygonToPath', () => {
  it('returns null for fewer than 3 points', () => {
    expect(ragPolygonToPath(new paper.PaperScope(), [])).toBeNull()
  })

  it('builds a closed path in the given scope', () => {
    const scope = new paper.PaperScope()
    scope.setup(new scope.Size(200, 100))
    const path = ragPolygonToPath(scope, [
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 0 },
    ])
    expect(path?.closed).toBe(true)
    expect(path?.segments).toHaveLength(4)
    expect(path?.bounds.width).toBe(70)
    expect(path?.project).toBe(scope.project)
  })
})

describe('pathToOutline', () => {
  it('returns the path points as one contour without changing the path', async () => {
    const { pathToOutline } = await import('../../src/shape2d')
    const scope = new paper.PaperScope()
    scope.setup(new scope.Size(200, 100))
    const polygon = [
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 0 },
    ]
    const path = ragPolygonToPath(scope, polygon)
    if (!path) throw new Error('expected a path')
    expect(pathToOutline(path)).toEqual({ contours: [polygon] })
    expect(path.segments).toHaveLength(4)
  })
})
