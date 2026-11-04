import { LatheGeometry, Vector2 } from 'three'
import { buildLathe } from '../../src/render3d/lathe'

describe('buildLathe', () => {
  // A profile with a ledge, a slope and a curve-ish run.
  const points = [
    new Vector2(0, -50),
    new Vector2(40, -50),
    new Vector2(40, -10),
    new Vector2(25, 0),
    new Vector2(30, 20),
    new Vector2(0, 30),
  ]
  const ledge = [0, 0.2, 0.5, 0.9, 0.1, 0]

  it.each([
    [12, 0, Math.PI * 2],
    [7, -Math.PI / 2, Math.PI / 3],
  ])('matches LatheGeometry (%s steps from %s over %s)', (segments, phiStart, phiLength) => {
    const ours = buildLathe(points, ledge, segments, phiStart, phiLength)
    const three = new LatheGeometry(points, segments, phiStart, phiLength)
    for (const name of ['position', 'normal', 'uv'] as const) {
      const a = ours.getAttribute(name).array
      const b = three.getAttribute(name).array
      expect(a.length).toBe(b.length)
      a.forEach((value, i) => expect(value).toBeCloseTo(b[i] as number, 4))
    }
    expect(Array.from(ours.getIndex()?.array ?? [])).toEqual(
      Array.from(three.getIndex()?.array ?? []),
    )
  })

  it('repeats each profile point’s ledge value around the axis', () => {
    const geometry = buildLathe(points, ledge, 3, 0, Math.PI)
    const values = Array.from(geometry.getAttribute('aLedge').array)
    expect(values).toHaveLength(4 * points.length)
    expect(values.slice(points.length, 2 * points.length).map((v) => +v.toFixed(3))).toEqual(ledge)
  })
})

describe('surface coordinates', () => {
  it('measure the way down against the radius, from 0 at the top, whichever way the profile runs', async () => {
    const { surfaceCoordinates } = await import('../../src/render3d/lathe')
    // A wall of radius 50, 100 tall, then a ledge out to radius 100 and a wall 100 tall.
    const down = [
      { x: 50, y: 100 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: -100 },
    ]
    expect(surfaceCoordinates(down)).toEqual([0, 2, 2, 3])
    // The same profile bottom to top: the same coordinate at each point.
    expect(surfaceCoordinates([...down].reverse())).toEqual([3, 2, 2, 0])
  })

  it('find the coordinate at a height (where the wall first reaches it from the top)', async () => {
    const { surfaceAtHeight, surfaceCoordinates } = await import('../../src/render3d/lathe')
    const wall = [
      { x: 50, y: 100 },
      { x: 50, y: 0 },
    ]
    const surface = surfaceCoordinates(wall)
    expect(surfaceAtHeight(wall, surface, 50)).toBeCloseTo(1)
    expect(surfaceAtHeight(wall, surface, 100)).toBeCloseTo(0)
  })

  it('go on the lathe as aSurface when given', async () => {
    const { buildLathe } = await import('../../src/render3d/lathe')
    const wall = [
      { x: 50, y: 100 },
      { x: 50, y: 0 },
    ]
    const geometry = buildLathe(wall, [0, 0], 4, 0, Math.PI * 2, null, [0, 2])
    expect(Array.from(geometry.getAttribute('aSurface').array).slice(0, 4)).toEqual([0, 2, 0, 2])
    expect(buildLathe(wall, [0, 0], 4, 0, Math.PI * 2).getAttribute('aSurface')).toBeUndefined()
  })
})
