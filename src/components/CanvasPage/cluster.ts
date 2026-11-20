import type { NodeLink } from './graph'

/**
 * A cluster (⌘G): modifier nodes grouped under one frame with one output. Linking the
 * cluster's output to a scene links every member to it (expandClusterLinks), in the order
 * they appear on the canvas; moving the cluster moves its members. Its frame is drawn around
 * the members' cards, so it has no position of its own.
 */
export interface ClusterNode {
  id: string
  name: string
  /** Member node ids (modifier nodes), each in at most one cluster. */
  members: string[]
}

/** The frame around a cluster's cards, in screen px at full card scale (scaled like cards). */
export const CLUSTER_FRAME = { pad: 14, header: 30 }

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A cluster's frame (canvas px) around its members' cards; `scale` is a card's on-canvas
 *  scale (cardScale(zoom) / zoom). Null with no members on the canvas. */
export function clusterBounds(members: readonly Rect[], scale: number): Rect | null {
  if (!members.length) return null
  const pad = CLUSTER_FRAME.pad * scale
  const header = CLUSTER_FRAME.header * scale
  const left = Math.min(...members.map((m) => m.x)) - pad
  const top = Math.min(...members.map((m) => m.y)) - pad - header
  const right = Math.max(...members.map((m) => m.x + m.width)) + pad
  const bottom = Math.max(...members.map((m) => m.y + m.height)) + pad
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Where a cluster's output port is (canvas px): its header's right end. */
export function clusterPort(bounds: Rect, scale: number) {
  return { x: bounds.x + bounds.width, y: bounds.y + (CLUSTER_FRAME.header * scale) / 2 }
}

/**
 * `ids` grouped into a new cluster (they leave any cluster they were in; clusters left empty
 * are dropped). `order` is the canvas's node order, which members follow.
 */
export function groupNodes(
  clusters: readonly ClusterNode[],
  ids: readonly string[],
  cluster: { id: string; name: string },
  order: readonly string[],
): ClusterNode[] {
  const grouped = new Set(ids)
  const members = order.filter((id) => grouped.has(id))
  if (!members.length) return [...clusters]
  return [
    ...pruneClusters(
      clusters.map((c) => ({ ...c, members: c.members.filter((id) => !grouped.has(id)) })),
    ),
    { ...cluster, members },
  ]
}

/** Clusters without members that no longer exist (and without clusters left empty). */
export function pruneClusters(
  clusters: readonly ClusterNode[],
  existing?: ReadonlySet<string>,
): ClusterNode[] {
  return clusters.flatMap((cluster) => {
    const members = existing ? cluster.members.filter((id) => existing.has(id)) : cluster.members
    if (!members.length) return []
    return [members.length === cluster.members.length ? cluster : { ...cluster, members }]
  })
}

/**
 * The links as scenes see them: a link from a cluster becomes a link from each member (in
 * member order, muted with it). A member also linked on its own to the same scene counts once.
 */
export function expandClusterLinks(
  links: readonly NodeLink[],
  clusters: readonly ClusterNode[],
): NodeLink[] {
  if (!clusters.length) return [...links]
  const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]))
  const seen = new Set<string>()
  const out: NodeLink[] = []
  for (const link of links) {
    const cluster = byId.get(link.from)
    const expanded = cluster ? cluster.members.map((from) => ({ ...link, from })) : [link]
    for (const item of expanded) {
      const key = `${item.from}→${item.to}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
}
