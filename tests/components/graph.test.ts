import {
  cardScale,
  connect,
  createModifier,
  createSceneModifiersResolver,
  DEFAULT_ETCH,
  DEFAULT_TEXTURE,
  DEFAULT_TWIST,
  inputPort,
  linkPath,
  NODE_CARD,
  outputPort,
  modifiersByScene,
} from '../../src/components/CanvasPage/graph'

describe('node graph', () => {
  it('resolves linked materials per scene, with the last link taking precedence', () => {
    const a = createModifier('material', 'a', 'a', 0, 0)
    const b = createModifier('material', 'b', 'b', 0, 0)
    const resolved = modifiersByScene(
      [
        { from: 'a', to: 's1' },
        { from: 'b', to: 's1' },
        { from: 'a', to: 's2' },
      ],
      [a, b],
    )
    expect(resolved.get('s1')?.material).toBe(b.params)
    expect(resolved.get('s2')?.material).toBe(a.params)
    expect(modifiersByScene([], [a]).has('s1')).toBe(false)
  })

  it('links an output to an input once', () => {
    const links = connect(connect([], 'twist-1', 'scene-1'), 'twist-1', 'scene-1')
    expect(links).toEqual([{ from: 'twist-1', to: 'scene-1' }])
    expect(connect(links, 'twist-2', 'scene-1')).toHaveLength(2)
  })

  it('gives each scene its twists, etches and textures, in the order they were linked', () => {
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
    const t = createModifier('texture', 't', 'texture 1', 0, 0)
    const byScene = modifiersByScene(
      [
        { from: 'b', to: 's1' },
        { from: 'e', to: 's1' },
        { from: 't', to: 's1' },
        { from: 'a', to: 's1' },
        { from: 'a', to: 's2' },
        { from: 'gone', to: 's2' },
      ],
      [twistA, twistB, e, t],
    )
    expect(byScene.get('s1')?.twists.map((twist) => twist.flutes)).toEqual([9, 5])
    expect(byScene.get('s1')?.etches).toEqual([DEFAULT_ETCH])
    expect(byScene.get('s1')?.textures).toEqual([DEFAULT_TEXTURE])
    expect(byScene.get('s2')).toEqual({
      twists: [twistA.params],
      etches: [],
      textures: [],
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

describe('memoized scene modifiers', () => {
  it('ignores card presentation and invalidates only scenes with changed inputs', () => {
    const resolve = createSceneModifiersResolver()
    const a = createModifier('twist', 'a', 'A', 0, 0)
    const b = createModifier('etch', 'b', 'B', 0, 0)
    const links = [
      { from: 'a', to: 's1' },
      { from: 'b', to: 's2' },
    ]
    const first = resolve(links, [a, b])
    expect(resolve([...links], [{ ...a, x: 50, y: 20, collapsed: true, name: 'renamed' }, b])).toBe(
      first,
    )
    const changed = resolve(links, [{ ...a, params: { ...a.params } } as typeof a, b])
    expect(changed).not.toBe(first)
    expect(changed.get('s1')).not.toBe(first.get('s1'))
    expect(changed.get('s2')).toBe(first.get('s2'))
  })

  it('tracks pattern map identity and link membership/order, including pending patterns', () => {
    const resolve = createSceneModifiersResolver()
    const a = createModifier('pattern', 'a', 'A', 0, 0)
    const b = createModifier('pattern', 'b', 'B', 0, 0)
    const links = [
      { from: 'a', to: 's1' },
      { from: 'b', to: 's1' },
      { from: 'b', to: 's2' },
    ]
    const map = { data: new Uint8Array(4), width: 2, height: 2 }
    const pending = resolve(links, [a, b])
    const ready = resolve(links, [a, b], new Map([['a', map]]))
    expect(ready.get('s1')?.patterns).toEqual([{ map, params: a.params }])
    expect(ready.get('s2')).toBe(pending.get('s2'))
    expect(resolve(links, [a, b], new Map([['a', map]]))).toBe(ready)
    const reordered = resolve([links[1]!, links[0]!, links[2]!], [a, b], new Map([['a', map]]))
    expect(reordered.get('s1')).not.toBe(ready.get('s1'))
    expect(reordered.get('s2')).toBe(ready.get('s2'))
    const removed = resolve([links[0]!, links[2]!], [a, b], new Map([['a', map]]))
    expect(removed.get('s1')).not.toBe(reordered.get('s1'))
    expect(removed.get('s2')).toBe(reordered.get('s2'))
    const replaced = resolve([links[0]!, links[2]!], [a, b], new Map([['a', { ...map }]]))
    expect(replaced.get('s1')).not.toBe(removed.get('s1'))
    expect(replaced.get('s2')).toBe(removed.get('s2'))
  })
})
