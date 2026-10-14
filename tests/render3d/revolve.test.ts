import { Vector2 } from 'three'
import {
  outlineToLatheProfile,
  outlineToLatheProfiles,
  subdivideProfile,
  withCrispCorners,
} from '../../src/render3d'

// Negative space of two lines (widths 30 and 80) in a 100px column, line height 10.
const outline = {
  contours: [
    [
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 80, y: 10 },
      { x: 80, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 0 },
    ],
  ],
}

const xy = (points: { x: number; y: number }[]) => points.map(({ x, y }) => [x, y])

describe('outlineToLatheProfile', () => {
  it('maps to radius from the axis, y up, walking bottom → top', () => {
    expect(xy(outlineToLatheProfile(outline, 100))).toEqual([
      [0, -20],
      [20, -20],
      [20, -10],
      [70, -10],
      [70, -0],
      [0, -0],
    ])
  })

  it('is empty when the outline does not touch the axis', () => {
    expect(outlineToLatheProfile(outline, 200)).toEqual([])
  })
})

describe('outlineToLatheProfiles', () => {
  it('revolves every contour that touches the axis, skipping the rest', () => {
    const away = [
      { x: 0, y: 40 },
      { x: 10, y: 40 },
      { x: 10, y: 50 },
    ]
    const profiles = outlineToLatheProfiles({ contours: [...outline.contours, away] }, 100)
    expect(profiles).toHaveLength(1)
  })
})

describe('withCrispCorners', () => {
  it('duplicates sharp corners (all interior points of a stepped profile)', () => {
    const profile = outlineToLatheProfile(outline, 100)
    expect(withCrispCorners(profile)).toHaveLength(2 + (profile.length - 2) * 2)
  })

  it('leaves gentle curve points alone', () => {
    const arc = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 9) * (Math.PI / 2)
      return new Vector2(Math.cos(a) * 10, Math.sin(a) * 10)
    })
    expect(withCrispCorners(arc)).toHaveLength(arc.length)
  })
})

describe('subdivideProfile', () => {
  it('splits long segments into collinear pieces no longer than the max', () => {
    const out = subdivideProfile([new Vector2(0, 0), new Vector2(0, 10), new Vector2(3, 10)], 4)
    expect(out.map((p) => [p.x, Number(p.y.toFixed(4))])).toEqual([
      [0, 0],
      [0, 3.3333],
      [0, 6.6667],
      [0, 10],
      [3, 10],
    ])
  })
})
