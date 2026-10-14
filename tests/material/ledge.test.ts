import { ledgeOcclusion } from '../../src/material'

// A lathe profile, bottom → top (x = radius, y up): a narrow waist (r = 20) under a wide
// disc (r = 60) whose underside is at y = 10.
//   (0,0) → (20,0) → (20,10) → (60,10) → (60,20) → (0,20)
const profile = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 10 },
  { x: 60, y: 10 },
  { x: 60, y: 20 },
  { x: 0, y: 20 },
]

describe('ledgeOcclusion', () => {
  it('shades the wall right under an overhang, fading over the reach', () => {
    const occ = ledgeOcclusion(profile, 10)
    expect(occ[2]).toBeCloseTo(1) // (20,10): tucked right under the ledge
    expect(occ[1]).toBeCloseTo(0) // (20,0): a full reach below it
  })

  it('leaves points not under anything open', () => {
    const occ = ledgeOcclusion(profile, 10)
    expect(occ[4]).toBe(0) // the disc's outer top corner
    expect(occ[5]).toBe(0) // the axis at the top
  })

  it('does not treat an upward step (wider below) as an overhang', () => {
    // Wide base (r = 60) under a narrow top (r = 20): the step faces up.
    const upStep = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]
    // Everything above the base's own bottom face stays open: the step faces up.
    // (The bottom face itself does face down, so the axis point beside it is shaded.)
    expect(ledgeOcclusion(upStep, 10).slice(1)).toEqual([0, 0, 0, 0, 0])
  })

  it('scales with how far the ledge sticks out', () => {
    const shallow = ledgeOcclusion(
      profile.map((p) => ({ ...p, x: Math.min(p.x, 22) })),
      10,
    )
    expect(shallow[2]).toBeCloseTo(0.2) // overhang of 2px over a 10px reach
  })
})
