import {
  bandCoord,
  gradientCoord,
  gradientRamp,
  gradientSpan,
  hueRotate,
  samplePalette,
  tiltedGradientLine,
  type PaletteStop,
} from '../../src/material'

const black = [0, 0, 0] as const
const white = [1, 1, 1] as const
const red = [1, 0, 0] as const
const stops: PaletteStop[] = [
  { position: 0, color: black },
  { position: 0.5, color: white },
  { position: 1, color: red },
]

describe('gradientCoord', () => {
  it('is the identity with no offset and scale 1', () => {
    for (const t of [0, 0.25, 0.5, 1]) expect(gradientCoord(t, 0, 1)).toBeCloseTo(t)
  })

  it('positive offset moves the bands down (samples earlier stops lower)', () => {
    expect(gradientCoord(0.5, 0.2, 1)).toBeCloseTo(0.3)
  })

  it('scale stretches around the middle', () => {
    expect(gradientCoord(0.5, 0, 2)).toBeCloseTo(0.5)
    expect(gradientCoord(1, 0, 2)).toBeCloseTo(0.75)
    expect(gradientCoord(1, 0, 0.5)).toBeCloseTo(1.5)
  })
})

describe('samplePalette', () => {
  it('hits each stop exactly and clamps outside 0–1', () => {
    expect(samplePalette(stops, 0)).toEqual(black)
    expect(samplePalette(stops, 0.5)).toEqual(white)
    expect(samplePalette(stops, 1)).toEqual(red)
    expect(samplePalette(stops, -1)).toEqual(black)
    expect(samplePalette(stops, 2)).toEqual(red)
  })

  it('blends with a smoothstep between stops (halfway is an even mix)', () => {
    const [r, g, b] = samplePalette(stops, 0.25)
    expect([r, g, b].map((c) => Number(c.toFixed(6)))).toEqual([0.5, 0.5, 0.5])
    // Smoothstep eases in: a quarter of the way into a segment is less than a quarter mixed.
    expect(samplePalette(stops, 0.125)[0]).toBeLessThan(0.25)
  })

  it('banding 0 blends linearly: a quarter into a segment is exactly a quarter mixed', () => {
    expect(samplePalette(stops, 0.125, 0)[0]).toBeCloseTo(0.25)
    // Endpoints are the same either way.
    expect(samplePalette(stops, 0.5, 0)).toEqual(white)
  })

  it('supports a single stop', () => {
    expect(samplePalette([{ position: 0, color: red }], 0.7)).toEqual(red)
  })
})

describe('gradientRamp', () => {
  it('samples the palette top → bottom for 2D gradients', () => {
    const ramp = gradientRamp(stops, { gradientOffset: 0, gradientScale: 1, banding: 1 }, 5)
    expect(ramp.map((s) => s.offset)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(ramp[0]?.color).toEqual(black)
    expect(ramp[4]?.color).toEqual(red)
  })

  it('covers the gradient span, applying offset and scale like the shader', () => {
    const look = { gradientOffset: 0.1, gradientScale: 1.5, banding: 1 }
    const [from, to] = gradientSpan(look)
    const ramp = gradientRamp(stops, look, 3)
    // Ramp offset 0.5 is the middle of the span, not band coordinate 0.5.
    const band = from + (to - from) * 0.5
    expect(ramp[1]?.color).toEqual(samplePalette(stops, gradientCoord(band, 0.1, 1.5)))
    // The span's ends are exactly the first and last stops.
    expect(ramp[0]?.color).toEqual(black)
    expect(ramp[2]?.color).toEqual(red)
  })
})

describe('bandCoord (diagonal bands)', () => {
  it('is depth from the top with no tilt', () => {
    expect(bandCoord(50, 123, 100, 0)).toBeCloseTo(0.5)
  })

  it('adds tilt × distance from the axis, in units of the height', () => {
    // 40px left of the axis with slope 0.5 shifts the band by -0.2.
    expect(bandCoord(50, -40, 100, 0.5)).toBeCloseTo(0.3)
  })
})

describe('gradientSpan', () => {
  it('is 0–1 with no offset and scale 1', () => {
    expect(gradientSpan({ gradientOffset: 0, gradientScale: 1 })).toEqual([0, 1])
  })

  it('is where gradientCoord crosses 0 and 1', () => {
    const look = { gradientOffset: 0.2, gradientScale: 1.5 }
    const [from, to] = gradientSpan(look)
    expect(gradientCoord(from, 0.2, 1.5)).toBeCloseTo(0)
    expect(gradientCoord(to, 0.2, 1.5)).toBeCloseTo(1)
  })
})

describe('tiltedGradientLine', () => {
  // A point's position along the 2D gradient line must equal its ramp offset, i.e. the
  // band coordinate mapped onto the span. Checked at scattered points.
  it.each([0, 0.35, -0.8])('reproduces bandCoord across the shape (tilt %s)', (tilt) => {
    const shape = { top: 20, height: 200 }
    const axisX = 600
    const span: [number, number] = [-0.25, 1.4]
    const { from, to } = tiltedGradientLine(shape, axisX, tilt, span)
    const dx = to.x - from.x
    const dy = to.y - from.y
    for (const [x, y] of [
      [100, 20],
      [450, 130],
      [599, 219],
      [320, 75],
    ] as const) {
      const along = ((x - from.x) * dx + (y - from.y) * dy) / (dx * dx + dy * dy)
      const band = bandCoord(y - shape.top, x - axisX, shape.height, tilt)
      expect(along).toBeCloseTo((band - span[0]) / (span[1] - span[0]))
    }
  })
})

describe('hueRotate', () => {
  it('is the identity at 0° and 360°, and leaves grays alone', () => {
    expect(hueRotate([0.8, 0.3, 0.1], 0).map((c) => +c.toFixed(6))).toEqual([0.8, 0.3, 0.1])
    expect(hueRotate([0.8, 0.3, 0.1], 360).map((c) => +c.toFixed(6))).toEqual([0.8, 0.3, 0.1])
    expect(hueRotate([0.4, 0.4, 0.4], 50).map((c) => +c.toFixed(6))).toEqual([0.4, 0.4, 0.4])
  })

  it('rotates red → green at +120°', () => {
    expect(hueRotate([1, 0, 0], 120).map((c) => +c.toFixed(6))).toEqual([0, 1, 0])
  })

  it('negative angles push orange toward red and lavender toward blue', () => {
    const orange = [0.93, 0.33, 0.19] as const
    const redder = hueRotate(orange, -25)
    expect(redder[1] / redder[0]).toBeLessThan(orange[1] / orange[0])

    const lavender = [0.66, 0.65, 0.95] as const
    const bluer = hueRotate(lavender, -25)
    expect(bluer[0] / bluer[2]).toBeLessThan(lavender[0] / lavender[2])
  })
})
