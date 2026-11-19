import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ETCH,
  DEFAULT_PATTERN,
  DEFAULT_TEXTURE,
  DEFAULT_TWIST,
} from '../../src/components/CanvasPage/graph'
import { etchShape } from '../../src/render3d/etch'
import { modifierRange } from '../../src/render3d/modifierRange'
import { patternPlacement } from '../../src/render3d/pattern'
import { textureShape } from '../../src/render3d/texture'
import { twistShape } from '../../src/render3d/twist'

describe('modifierRange', () => {
  it.each([
    [0, 100, 0, 1],
    [75, 25, 0.25, 0.75],
    [-20, 120, 0, 1],
    [150, 110, 1, 1],
    [42.5, 42.5, 0.425, 0.425],
  ])('maps %s–%s%% to %s–%s', (from, to, expectedFrom, expectedTo) => {
    expect(modifierRange(from, to)).toEqual({ from: expectedFrom, to: expectedTo })
  })

  it('maps all four modifier kinds consistently without changing their parameters', () => {
    const endpoints = { from: 125, to: 25 }
    const inputs = [
      { ...DEFAULT_TWIST, ...endpoints },
      { ...DEFAULT_ETCH, ...endpoints },
      { ...DEFAULT_PATTERN, ...endpoints },
      { ...DEFAULT_TEXTURE, ...endpoints },
    ] as const
    const shapes = [
      twistShape(inputs[0]),
      etchShape(inputs[1]),
      patternPlacement(inputs[2]),
      textureShape(inputs[3]),
    ]
    for (const shape of shapes) expect(shape).toMatchObject({ from: 0.25, to: 1 })
    for (const input of inputs) expect(input).toMatchObject(endpoints)
  })
})
