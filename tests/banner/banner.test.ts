import { bannerFontSize, bannerLayout, bannerReveal } from '../../src/banner'

const options = {
  frameWidth: 1920,
  frameHeight: 1080,
  margin: 48,
  headlineWidth: 780,
  linkWidth: 620,
}

describe('bannerLayout', () => {
  it('sits on the margin at the bottom, the logo flush with the left edge', () => {
    const layout = bannerLayout({ ...options, position: 'bottom' })
    expect(layout.logo.x).toBe(0)
    expect(layout.link.right).toBe(1920 - 48)
    expect(layout.logo.y + layout.logo.height).toBeCloseTo(1080 - 48)
    expect(layout.logo.width / layout.logo.height).toBeCloseTo(120.67 / 40.66)
    expect(layout.fontSize).toBeCloseTo(bannerFontSize(1920))
  })

  it('spaces the headline evenly between the logo and the link', () => {
    const layout = bannerLayout({ ...options, position: 'bottom' })
    const before = layout.headline.x - (layout.logo.x + layout.logo.width)
    const after =
      layout.link.right - options.linkWidth - (layout.headline.x + options.headlineWidth)
    expect(before).toBeCloseTo(after)
    expect(before).toBeGreaterThan(0)
  })

  it('keeps the composition a margin clear: composition → row = row → frame edge', () => {
    const layout = bannerLayout({ ...options, position: 'bottom' })
    const trophyBottom = 1080 - layout.clearance
    expect(layout.logo.y - trophyBottom).toBeCloseTo(48)
    expect(1080 - (layout.logo.y + layout.logo.height)).toBeCloseTo(48)
  })

  it('mirrors to the top', () => {
    const layout = bannerLayout({ ...options, position: 'top' })
    expect(layout.logo.y).toBe(48)
    expect(layout.bar.y).toBe(0)
    expect(layout.bar.height).toBe(layout.clearance)
  })
})

describe('bannerReveal', () => {
  const layout = bannerLayout({ ...options, position: 'bottom' })

  it('shows nothing at 0 and everything in place at 1', () => {
    const start = bannerReveal(0, layout, 0.2)
    expect(start.background).toBe(0)
    // Every item starts below the bar's bottom (fully hidden by its clip).
    const barBottom = layout.bar.y + layout.bar.height
    expect(layout.logo.y + start.offsets[0]).toBeGreaterThanOrEqual(barBottom - 1e-9)
    expect(bannerReveal(1, layout, 0.2)).toEqual({ background: 1, offsets: [0, 0, 0] })
  })

  it('brings the items in one after another, rising', () => {
    const { offsets } = bannerReveal(0.4, layout, 0.2)
    expect(offsets[0]).toBeLessThan(offsets[1])
    expect(offsets[1]).toBeLessThan(offsets[2])
    expect(bannerReveal(0.6, layout, 0.2).offsets[0]).toBeLessThan(offsets[0])
  })
})
