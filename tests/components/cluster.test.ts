import { parseCanvasDocument } from '../../src/components/CanvasPage/canvasDocument'
import {
  CLUSTER_FRAME,
  clusterBounds,
  clusterPort,
  expandClusterLinks,
  groupNodes,
  pruneClusters,
  rewireToCluster,
  groupSelected,
  copiedGroups,
  pasteGroups,
  toggleMemberMute,
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
      // Groups were called clusters: old default names read as group names.
      { id: 'cluster-4', name: 'group 4', members: ['twist-1', 'etch-1'] },
    ])
    expect(doc.links).toEqual([{ from: 'cluster-4', to: 'scene-1' }])
    expect(doc.inserted.cluster).toBe(4)
  })

  describe('rewireToCluster', () => {
    it('members all feeding one artboard: one link from the cluster, where the first was', () => {
      const links = [
        { from: 'etch-1', to: 'scene-2' },
        { from: 'twist-1', to: 'scene-1' },
        { from: 'twist-2', to: 'scene-1' },
        { from: 'etch-2', to: 'scene-2' },
      ]
      expect(rewireToCluster(links, ['twist-1', 'twist-2'], 'cluster-1')).toEqual([
        { from: 'etch-1', to: 'scene-2' },
        { from: 'cluster-1', to: 'scene-1' },
        { from: 'etch-2', to: 'scene-2' },
      ])
    })

    it('keeps a shared mute', () => {
      const links = [
        { from: 'a', to: 's', muted: true },
        { from: 'b', to: 's', muted: true },
      ]
      expect(rewireToCluster(links, ['a', 'b'], 'c')).toEqual([{ from: 'c', to: 's', muted: true }])
    })

    it('leaves links alone unless every member feeds the same single artboard, muted alike', () => {
      const two = [
        { from: 'a', to: 's1' },
        { from: 'b', to: 's2' },
      ]
      expect(rewireToCluster(two, ['a', 'b'], 'c')).toBeNull()
      expect(rewireToCluster([{ from: 'a', to: 's' }], ['a', 'b'], 'c')).toBeNull()
      expect(
        rewireToCluster(
          [
            { from: 'a', to: 's' },
            { from: 'a', to: 's2' },
            { from: 'b', to: 's' },
          ],
          ['a', 'b'],
          'c',
        ),
      ).toBeNull()
      expect(
        rewireToCluster(
          [
            { from: 'a', to: 's', muted: true },
            { from: 'b', to: 's' },
          ],
          ['a', 'b'],
          'c',
        ),
      ).toBeNull()
      expect(rewireToCluster([], ['a'], 'c')).toBeNull()
    })
  })

  describe('groupSelected', () => {
    const order = ['a', 'b', 'c', 'd']
    const create = () => ({ id: 'cluster-9', name: 'group 9' })

    it('adds selected nodes to the selected group, keeping its name and links; theirs are dropped', () => {
      const clusters = [{ id: 'cluster-1', name: 'group 1', members: ['a', 'b'] }]
      const links = [
        { from: 'cluster-1', to: 's1' },
        { from: 'c', to: 's2' },
        { from: 'd', to: 's1' },
      ]
      expect(groupSelected(clusters, links, ['cluster-1', 'c'], order, create)).toEqual({
        id: 'cluster-1',
        clusters: [{ id: 'cluster-1', name: 'group 1', members: ['a', 'b', 'c'] }],
        links: [
          { from: 'cluster-1', to: 's1' },
          { from: 'd', to: 's1' },
        ],
      })
    })

    it('the first selected group takes in other selected groups and their links (once per target)', () => {
      const clusters = [
        { id: 'cluster-1', name: 'group 1', members: ['a'] },
        { id: 'cluster-2', name: 'group 2', members: ['b', 'c'], muted: ['c'] },
      ]
      const links = [
        { from: 'cluster-2', to: 's1' },
        { from: 'cluster-1', to: 's1' },
        { from: 'cluster-2', to: 's2' },
      ]
      expect(groupSelected(clusters, links, ['cluster-2', 'cluster-1'], order, create)).toEqual({
        id: 'cluster-2',
        clusters: [{ id: 'cluster-2', name: 'group 2', members: ['a', 'b', 'c'], muted: ['c'] }],
        links: [
          { from: 'cluster-2', to: 's1' },
          { from: 'cluster-2', to: 's2' },
        ],
      })
    })

    it('a new group feeds the one artboard its nodes fed, or drops their links', () => {
      const one = groupSelected(
        [],
        [
          { from: 'a', to: 's1' },
          { from: 'b', to: 's1' },
        ],
        ['a', 'b'],
        order,
        create,
      )
      expect(one?.links).toEqual([{ from: 'cluster-9', to: 's1' }])
      const two = groupSelected(
        [],
        [
          { from: 'a', to: 's1' },
          { from: 'b', to: 's2' },
          { from: 'c', to: 's2' },
        ],
        ['a', 'b'],
        order,
        create,
      )
      expect(two?.links).toEqual([{ from: 'c', to: 's2' }])
      expect(two?.clusters).toEqual([{ id: 'cluster-9', name: 'group 9', members: ['a', 'b'] }])
    })

    it('nothing to do: nothing groupable, or one group selected as is', () => {
      const clusters = [{ id: 'cluster-1', name: 'group 1', members: ['a', 'b'] }]
      expect(groupSelected(clusters, [], ['scene-1'], order, create)).toBeNull()
      expect(groupSelected(clusters, [], ['cluster-1', 'a'], order, create)).toBeNull()
    })
  })

  it('copies of grouped nodes join their group; copies of a whole group make a new one', () => {
    const clusters = [
      { id: 'cluster-1', name: 'group 1', members: ['a', 'b'] },
      { id: 'cluster-2', name: 'group 2', members: ['c'] },
    ]
    const groups = copiedGroups(clusters, ['a', 'cluster-2'], new Set(['a', 'c']))
    expect(groups).toEqual([
      { id: 'cluster-1', members: ['a'], whole: false },
      { id: 'cluster-2', members: ['c'], whole: true },
    ])
    const remap = new Map([
      ['a', 'a2'],
      ['c', 'c2'],
    ])
    expect(
      pasteGroups(clusters, groups, remap, ['a', 'b', 'c', 'a2', 'c2'], () => ({
        id: 'cluster-3',
        name: 'group 3',
      })),
    ).toEqual([
      { id: 'cluster-1', name: 'group 1', members: ['a', 'b', 'a2'] },
      { id: 'cluster-2', name: 'group 2', members: ['c'] },
      { id: 'cluster-3', name: 'group 3', members: ['c2'] },
    ])
    // The group is gone: the copy is on its own.
    expect(
      pasteGroups([], groups.slice(0, 1), remap, ['a2'], () => ({ id: 'x', name: 'x' })),
    ).toEqual([])
  })

  it('grouped nodes mute within their group: its links skip them', () => {
    const clusters = toggleMemberMute(
      [{ id: 'cluster-1', name: 'group 1', members: ['a', 'b'] }],
      'b',
    )
    expect(clusters).toEqual([
      { id: 'cluster-1', name: 'group 1', members: ['a', 'b'], muted: ['b'] },
    ])
    expect(expandClusterLinks([{ from: 'cluster-1', to: 's' }], clusters)).toEqual([
      { from: 'a', to: 's' },
      { from: 'b', to: 's', muted: true },
    ])
    expect(toggleMemberMute(clusters, 'b')).toEqual([
      { id: 'cluster-1', name: 'group 1', members: ['a', 'b'] },
    ])
    // Leaving the group (pruned away) drops its mute.
    expect(pruneClusters(clusters, new Set(['a']))).toEqual([
      { id: 'cluster-1', name: 'group 1', members: ['a'] },
    ])
  })
})
