import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import {
  CLUSTER_FRAME,
  clusterBounds,
  clusterPort,
  expandClusterLinks,
  groupNodes,
  pruneClusters,
} from '../../src/components/CanvasPage/cluster'
import { createModifier } from '../../src/components/CanvasPage/graph'

describe('clusters', () => {
  it('group nodes in canvas order, taking them out of other clusters (dropping empty ones)', () => {
    const existing = [{ id: 'cluster-1', name: 'cluster 1', members: ['a', 'b'] }]
    const next = groupNodes(existing, ['c', 'a', 'b'], { id: 'cluster-2', name: 'cluster 2' }, [
      'a',
      'b',
      'c',
    ])
    expect(next).toEqual([{ id: 'cluster-2', name: 'cluster 2', members: ['a', 'b', 'c'] }])
    expect(groupNodes(existing, [], { id: 'x', name: 'x' }, ['a'])).toEqual(existing)
  })

  it('prunes members that are gone, and clusters left empty', () => {
    const clusters = [
      { id: 'c1', name: 'c1', members: ['a', 'b'] },
      { id: 'c2', name: 'c2', members: ['z'] },
    ]
    expect(pruneClusters(clusters, new Set(['a']))).toEqual([
      { id: 'c1', name: 'c1', members: ['a'] },
    ])
  })

  it('a link from a cluster is a link from each member (once each, muted with it)', () => {
    const clusters = [{ id: 'c1', name: 'c1', members: ['a', 'b'] }]
    expect(
      expandClusterLinks(
        [
          { from: 'a', to: 's1' },
          { from: 'c1', to: 's1' },
          { from: 'c1', to: 's2', muted: true },
          { from: 'x', to: 's1' },
        ],
        clusters,
      ),
    ).toEqual([
      { from: 'a', to: 's1' },
      { from: 'b', to: 's1' },
      { from: 'a', to: 's2', muted: true },
      { from: 'b', to: 's2', muted: true },
      { from: 'x', to: 's1' },
    ])
  })

  it('frames the members’ cards with a header above, its port at the header’s right end', () => {
    const bounds = clusterBounds(
      [
        { x: 0, y: 100, width: 260, height: 200 },
        { x: 300, y: 50, width: 260, height: 100 },
      ],
      1,
    )!
    const { pad, header } = CLUSTER_FRAME
    expect(bounds).toEqual({
      x: -pad,
      y: 50 - pad - header,
      width: 560 + 2 * pad,
      height: 300 - 50 + 2 * pad + header,
    })
    expect(clusterPort(bounds, 1)).toEqual({
      x: bounds.x + bounds.width,
      y: bounds.y + header / 2,
    })
    expect(clusterBounds([], 1)).toBeNull()
  })

  it('save and load: existing members only, one cluster each; links from clusters kept', () => {
    const twist = createModifier('twist', 'twist-1', 'twist 1', 0, 0)
    const etch = createModifier('etch', 'etch-1', 'etch 1', 0, 0)
    const doc = parseCanvasDocument({
      scenes: [{ id: 'scene-1', settings: {}, scene: {} }],
      modifiers: [twist, etch],
      clusters: [
        { id: 'cluster-4', name: 'cluster 4', members: ['twist-1', 'gone', 'etch-1'] },
        { id: 'cluster-5', name: 'cluster 5', members: ['etch-1'] },
      ],
      links: [
        { from: 'cluster-4', to: 'scene-1' },
        { from: 'cluster-5', to: 'scene-1' },
      ],
    })
    expect(doc.clusters).toEqual([
      { id: 'cluster-4', name: 'cluster 4', members: ['twist-1', 'etch-1'] },
    ])
    expect(doc.links).toEqual([{ from: 'cluster-4', to: 'scene-1' }])
    expect(doc.inserted.cluster).toBe(4)
  })
})
