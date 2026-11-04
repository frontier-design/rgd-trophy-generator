import {
  cardScale,
  connect,
  createModifier,
  DEFAULT_ETCH,
  DEFAULT_TWIST,
  inputPort,
  linkPath,
  NODE_CARD,
  outputPort,
  modifiersByScene,
} from '../../src/components/CanvasPage/graph'

describe('node graph', () => {
  it('links an output to an input once', () => {
    const links = connect(connect([], 'twist-1', 'scene-1'), 'twist-1', 'scene-1')
    expect(links).toEqual([{ from: 'twist-1', to: 'scene-1' }])
    expect(connect(links, 'twist-2', 'scene-1')).toHaveLength(2)
  })

  it('gives each scene its twists and etches, in the order they were linked', () => {
    const twist = (id: string, flutes: number) => ({
      kind: 'twist' as const,
      id,
      name: id,
      x: 0,
      y: 0,
      params: { ...DEFAULT_TWIST, flutes },
    })
    const twistA = twist('a', 5)
    const twistB = twist('b', 9)
    const e = createModifier('etch', 'e', 'etch 1', 0, 0)
    const byScene = modifiersByScene(
      [
        { from: 'b', to: 's1' },
        { from: 'e', to: 's1' },
        { from: 'a', to: 's1' },
        { from: 'a', to: 's2' },
        { from: 'gone', to: 's2' },
      ],
      [twistA, twistB, e],
    )
    expect(byScene.get('s1')?.twists.map((twist) => twist.flutes)).toEqual([9, 5])
    expect(byScene.get('s1')?.etches).toEqual([DEFAULT_ETCH])
    expect(byScene.get('s2')).toEqual({
      twists: [twistA.params],
      etches: [],
      patterns: [],
      linked: true,
    })
    expect(byScene.get('s3')).toBeUndefined()
  })

  it('places ports: a card’s output at its header’s right end (screen-sized), a scene’s input on its left side', () => {
    expect(outputPort({ x: 10, y: 20 }, 0.5)).toEqual({
      x: 10 + NODE_CARD.width * 2,
      y: 20 + NODE_CARD.header,
    })
    // A quarter of the way down (the middle is the left resize handle's).
    expect(inputPort({ x: 100, y: 200 })).toEqual({ x: 100, y: 200 + 270 })
    expect(linkPath({ x: 0, y: 0 }, { x: 400, y: 100 }, 1)).toBe('M 0 0 C 200 0, 200 100, 400 100')
  })
})

describe('pattern nodes in scenes', () => {
  it('join a scene once their map is ready', () => {
    const pattern = createModifier('pattern', 'p', 'pattern 1', 0, 0)
    const links = [{ from: 'p', to: 's' }]
    expect(modifiersByScene(links, [pattern]).get('s')).toMatchObject({
      patterns: [],
      linked: true,
    })
    const map = { data: new Uint8Array(4), width: 2, height: 2 }
    const ready = modifiersByScene(links, [pattern], new Map([['p', map]])).get('s')
    expect(ready?.patterns).toEqual([{ map, params: pattern.params }])
  })
})

describe('node cards', () => {
  it('stay full size on screen down to half zoom, then shrink with the canvas (to a floor)', () => {
    expect(cardScale(2)).toBe(1)
    expect(cardScale(0.5)).toBe(1)
    expect(cardScale(0.25)).toBe(0.5)
    // …but never so small their names can't be read.
    expect(cardScale(0.05)).toBe(0.3)
  })

  it('put the output port at the card’s scale', () => {
    // At 25% the card is half size on screen: 130 px wide, i.e. 520 canvas px.
    expect(outputPort({ x: 0, y: 0 }, 0.25)).toEqual({
      x: NODE_CARD.width * 2,
      y: NODE_CARD.header,
    })
  })
})
