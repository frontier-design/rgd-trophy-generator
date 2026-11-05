import { revealedBoxes, revealFill, stackReveal, staggered, typeReveal } from '../../src/rag'

describe('revealFill', () => {
  it('starts full, ends at nothing, easing in and out', () => {
    expect(revealFill(0)).toBe(1)
    expect(revealFill(1)).toBe(0)
    expect(revealFill(0.5)).toBeCloseTo(0.5)
    // From rest and back to rest: barely moving at the ends.
    expect(1 - revealFill(0.01)).toBeLessThan(1e-4)
    expect(revealFill(0.99)).toBeLessThan(1e-4)
  })

  it('only ever shrinks', () => {
    const values = Array.from({ length: 21 }, (_, i) => revealFill(i / 20))
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]!)
  })
})

describe('stackReveal', () => {
  const options = { stagger: 0.2, slide: 100 }
  // 4 lines: the top line starts 3 × 0.2 slides in, so the reveal lasts 1.6 slides.
  const at = (time: number) => stackReveal(4, time / 1.6, options)

  it('shows nothing at 0 and every line in place at 1', () => {
    expect(stackReveal(4, 0, options).every((line) => !line.shown)).toBe(true)
    expect(stackReveal(4, 1, options)).toEqual(
      Array.from({ length: 4 }, () => ({ shown: true, offset: 0, settle: 1 })),
    )
  })

  it('stacks lines in from the bottom, each sliding in from the left', () => {
    const lines = at(0.3)
    expect(lines.map((line) => line.shown)).toEqual([false, false, true, true])
    // The bottom line is 0.3 of its slide in, the next 0.1: eased out, the earlier one is
    // further along.
    expect(lines[3]?.offset).toBeCloseTo(-100 * 0.7 ** 2.5)
    expect(lines[2]?.offset).toBeCloseTo(-100 * 0.9 ** 2.5)
    expect(lines[2]?.offset).toBeLessThan(lines[3]?.offset ?? 0)
  })

  it('brings all lines in together at stagger 0', () => {
    const lines = stackReveal(3, 0.5, { stagger: 0, slide: 10 })
    expect(lines.every((line) => line.shown && line.offset === lines[0]?.offset)).toBe(true)
  })
})

describe('revealedBoxes', () => {
  const lines = [
    { index: 0, text: 'RGD', width: 30 },
    { index: 1, text: 'BRANDING', width: 80 },
  ]
  const options = { lineHeight: 10, padX: 4, padY: 2, radius: 0 }

  it('carves only shown lines, each moved with its line', () => {
    const boxes = revealedBoxes(
      lines,
      [
        { shown: false, offset: 0, settle: 0 },
        { shown: true, offset: -12, settle: 0.5 },
      ],
      options,
    )
    expect(boxes).toEqual([{ lineIndex: 1, x: -16, y: 8, width: 88, height: 14, radius: 0 }])
  })

  it('centered: a stacked line reaches its end; a typed one grows in from the left', () => {
    const centered = { ...options, offsets: [35, 10] }
    const [stacked] = revealedBoxes(lines, [{ shown: true, offset: 0, settle: 1 }], centered)
    expect(stacked?.width).toBe(35 + 30 + 8)
    const typed = (settle: number) =>
      revealedBoxes(lines, [{ shown: true, offset: 0, settle, extent: 12 }], centered)[0]?.width
    expect(typed(0)).toBe(12)
    expect(typed(1)).toBe(35 + 12 + 8)
  })
})

describe('staggered', () => {
  it('starts each item a stagger after the last, easing each in over one unit', () => {
    // 3 items, 0.5 apart: 2 units in all. Halfway (t = 1): the first settled, the second
    // halfway, the third just started.
    const [a, b, c] = staggered(3, 0.5, 0.5)
    expect(a).toEqual({ shown: true, settle: 1 })
    expect(b?.settle).toBeCloseTo(1 - 0.5 ** 2.5)
    expect(c).toEqual({ shown: false, settle: 0 })
  })

  it('times the text and the banner alike', () => {
    // Line reveals use the same settle, in reverse (bottom line first).
    const lines = stackReveal(3, 0.5, { stagger: 0.5, slide: 10 })
    expect(lines.map((line) => line.settle)).toEqual(
      staggered(3, 0.5, 0.5)
        .map((item) => item.settle)
        .reverse(),
    )
  })
})

describe('typeReveal', () => {
  // "AB C" (a space between B and C) and "DE": 10 px per character.
  const lines = [
    { text: 'AB C', prefixWidths: [0, 10, 20, 30, 40] },
    { text: 'DE', prefixWidths: [0, 10, 20] },
  ]
  const options = { stagger: 1, spacing: 6, scatter: 0 }
  // 5 letters, one after another: 5 units in all.
  const at = (time: number) => typeReveal(lines, time / 5, options)

  it('types letters one by one at their places, top line first, skipping spaces', () => {
    const [first, second] = at(2.5)
    // A and B settled; C (after the space) halfway; nothing on line 2 yet.
    expect(first?.letters?.shown).toEqual([true, true, false, true])
    expect(second?.shown).toBe(false)
    expect(at(0).every((line) => !line.shown)).toBe(true)
  })

  it('brings each letter in with extra space that closes up, pushing later ones along', () => {
    const [first] = at(2.5)
    const settle = 1 - 0.5 ** 2.5
    // A and B are settled (no offset); C still has (1 − settle) of its spacing.
    expect(first?.letters?.offsets.slice(0, 2)).toEqual([0, 0])
    expect(first?.letters?.offsets[3]).toBeCloseTo(6 * (1 - settle))
    // The groove reaches C's right edge, spacing included.
    expect(first?.extent).toBeCloseTo(40 + 6 * (1 - settle))
  })

  it('is all in place at 1', () => {
    const [first, second] = typeReveal(lines, 1, options)
    expect(first?.letters?.offsets).toEqual([0, 0, 0, 0])
    expect(first?.extent).toBe(40)
    expect(second?.extent).toBe(20)
  })

  it('scatters the order within each line', () => {
    const long = [{ text: 'ABCDEFGH', prefixWidths: Array.from({ length: 9 }, (_, i) => i * 10) }]
    const inOrder = typeReveal(long, 0.3, { ...options, scatter: 0 })[0]?.letters?.shown
    const scattered = typeReveal(long, 0.3, { ...options, scatter: 1 })[0]?.letters?.shown
    // Same count shown, but not just a prefix.
    expect(inOrder?.filter(Boolean).length).toBe(scattered?.filter(Boolean).length)
    expect(scattered).not.toEqual(inOrder)
  })

  it('carves a typed line only as far as its letters reach', () => {
    const measured = [
      { index: 0, text: 'AB C', width: 40 },
      { index: 1, text: 'DE', width: 20 },
    ]
    const boxes = revealedBoxes(measured, at(2.5), {
      lineHeight: 10,
      padX: 4,
      padY: 0,
      radius: 0,
    })
    expect(boxes).toHaveLength(1)
    expect(boxes[0]?.width).toBeCloseTo((at(2.5)[0]?.extent ?? 0) + 2 * 4)
  })
})

describe('line order', () => {
  it('stacks in from the top when asked', () => {
    // 3 lines, one after another: at a third of the way, only the first line is in.
    const fromTop = stackReveal(3, 0.3, { stagger: 1, slide: 10, from: 'top' })
    expect(fromTop.map((line) => line.shown)).toEqual([true, false, false])
    const fromBottom = stackReveal(3, 0.3, { stagger: 1, slide: 10 })
    expect(fromBottom.map((line) => line.shown)).toEqual([false, false, true])
  })

  it('types from the bottom line when asked', () => {
    const lines = [
      { text: 'AB', prefixWidths: [0, 10, 20] },
      { text: 'CD', prefixWidths: [0, 10, 20] },
    ]
    const options = { stagger: 1, spacing: 0, scatter: 0 }
    const [top, bottom] = typeReveal(lines, 0.5, { ...options, from: 'bottom' })
    expect(bottom?.letters?.shown).toEqual([true, true])
    expect(top?.shown).toBe(false)
  })
})
