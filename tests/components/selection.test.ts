import { describe, expect, it } from 'vitest'
import { createModifier } from '../../src/components/CanvasPage/graph'
import { createSceneNode } from '../../src/components/CanvasPage/sceneNode'
import {
  clearSelection,
  copySelection,
  normalizeRect,
  pasteSelection,
  pickSelection,
  pruneSelection,
  rectanglesIntersect,
  replaceSelection,
} from '../../src/components/CanvasPage/selection'

const counters = { scene: 4, twist: 2, etch: 0, pattern: 0, texture: 0, material: 0 }

describe('selection', () => {
  it('preserves a group on ordinary click and toggles with additive click', () => {
    const group = replaceSelection(['a', 'b', 'a'], 'b')
    expect(pickSelection(group, 'a')).toEqual({ ids: ['a', 'b'], activeId: 'a' })
    expect(pickSelection(group, 'c')).toEqual({ ids: ['c'], activeId: 'c' })
    expect(pickSelection(group, 'c', true)).toEqual({ ids: ['a', 'b', 'c'], activeId: 'c' })
    expect(pickSelection(group, 'b', true)).toEqual({ ids: ['a'], activeId: 'a' })
    expect(pickSelection(group, 'a', true)).toEqual({ ids: ['b'], activeId: 'b' })
    expect(pruneSelection(group, ['a'])).toEqual({ ids: ['a'], activeId: 'a' })
    expect(pruneSelection(group, [])).toEqual(clearSelection())
  })
  it('normalizes drags and intersects edges inclusively', () => {
    expect(normalizeRect({ x: 10, y: 20, width: -10, height: -20 })).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    })
    expect(
      rectanglesIntersect(
        { x: 10, y: 20, width: -10, height: -20 },
        { x: 10, y: 20, width: 3, height: 4 },
      ),
    ).toBe(true)
    expect(
      rectanglesIntersect({ x: 0, y: 0, width: 1, height: 1 }, { x: 2, y: 0, width: 1, height: 1 }),
    ).toBe(false)
  })
})

describe('subgraph clipboard', () => {
  it('snapshots nodes and internal links, remaps ids and maintains relative placement', () => {
    const scene = createSceneNode('scene-4', 'scene 4', 100, 200)
    scene.animateRevolve = true
    const modifier = structuredClone(createModifier('twist', 'twist-2', 'twist 2', 20, 80))
    const selection = replaceSelection(['master', modifier.id, scene.id], scene.id)
    const copy = copySelection(
      selection,
      [scene],
      [modifier],
      [
        { from: modifier.id, to: scene.id },
        { from: 'master', to: scene.id },
        { from: modifier.id, to: 'elsewhere' },
      ],
    )
    scene.frame.width = 500
    modifier.name = 'changed'
    if (modifier.kind === 'twist') modifier.params.depth = 999
    const pasted = pasteSelection(copy, counters, { at: { x: 1000, y: 2000 } })
    expect(pasted.ids).toEqual(['twist-3', 'scene-5'])
    expect(pasted.activeId).toBe('scene-5')
    expect(pasted.links).toEqual([{ from: 'twist-3', to: 'scene-5' }])
    expect(pasted.modifiers[0]).toMatchObject({ x: 1000, y: 2000, name: 'twist 3' })
    expect(pasted.scenes[0]).toMatchObject({
      x: 1080,
      y: 2120,
      name: 'scene 5',
      animateRevolve: false,
    })
    expect(pasted.scenes[0]!.frame.width).not.toBe(500)
    expect(pasted.modifiers[0]!.params).not.toEqual(modifier.params)
    pasted.scenes[0]!.frame.width = 100
    const again = pasteSelection(copy, pasted.inserted, { offset: { x: 40, y: 30 } })
    expect(again.scenes[0]).toMatchObject({ id: 'scene-6', x: 140, y: 230 })
    expect(again.scenes[0]!.frame.width).not.toBe(100)
    expect(counters.scene).toBe(4)
  })
  it('handles master-only selections without allocating ids', () => {
    const result = pasteSelection(
      copySelection(replaceSelection(['master']), [], [], []),
      counters,
      { offset: { x: 40, y: 40 } },
    )
    expect(result).toEqual({
      scenes: [],
      compositions: [],
      modifiers: [],
      links: [],
      inserted: { ...counters, shape: 0, lighting: 0, text: 0, composition: 0, cluster: 0 },
      ids: [],
      activeId: null,
    })
  })
})
