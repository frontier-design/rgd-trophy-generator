import { fitToFrame, lineBaseline } from '../../src/rag'

const frame = { width: 1920, height: 1080, padding: 60 }
const base = {
  widest: 300,
  lineCount: 4,
  fontSize: 50,
  leading: 1,
  metrics: { ascent: 40, descent: 10 },
  frame,
  bottomClearance: 60,
  overshoot: 3,
  padX: 15,
  padY: 15,
  carve: 0.8,
  minTop: 120,
}

describe('fitToFrame', () => {
  it('puts the edge in the frame’s middle, inside the margin', () => {
    expect(fitToFrame(base).columnWidth).toBe(1920 / 2 - 60)
  })

  it('sizes the type so the widest line and its box carve `carve` of the radius', () => {
    const fit = fitToFrame(base)
    const lineWidth = (base.widest * fit.fontSize) / base.fontSize
    expect(lineWidth + base.padX).toBeCloseTo(0.8 * fit.columnWidth)
    expect(fit.scale).toBeCloseTo(fit.fontSize / base.fontSize)
    expect(fit.lineHeight).toBeCloseTo(fit.fontSize * base.leading)
  })

  it('scales the padding with the type when asked', () => {
    const fit = fitToFrame({ ...base, scalePad: true })
    const lineWidth = (base.widest * fit.fontSize) / base.fontSize
    expect(lineWidth + base.padX * fit.scale).toBeCloseTo(0.8 * fit.columnWidth)
  })

  it('reaches the top band up to the top margin, the trophy ending at the bottom clearance', () => {
    for (const scalePad of [false, true]) {
      const fit = fitToFrame({ ...base, scalePad })
      const padY = scalePad ? base.padY * fit.scale : base.padY
      const lastBaseline = lineBaseline(3, fit.lineHeight, {
        ascent: base.metrics.ascent * fit.scale,
        descent: base.metrics.descent * fit.scale,
      })
      const textTop = frame.height - 60 - base.overshoot - lastBaseline
      expect(textTop - padY - fit.topHeight).toBeCloseTo(frame.padding)
    }
  })

  it('shrinks the type to leave `minTop` above the first box (band + top margin)', () => {
    const fit = fitToFrame({ ...base, widest: 10, lineCount: 8 })
    expect(fit.topHeight).toBeCloseTo(base.minTop - frame.padding)
  })
})
