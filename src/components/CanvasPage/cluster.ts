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
  /** Members muted on their own (⌘-click): the group's links don't reach scenes from them. */
  muted?: string[]
}

/** A cluster with `muted` trimmed to its members (left out when none are). */
function withMuted(cluster: ClusterNode, muted: readonly string[]): ClusterNode {
  const kept = cluster.members.filter((id) => muted.includes(id))
  const { muted: _previous, ...rest } = cluster
  void _previous
  return kept.length ? { ...rest, muted: kept } : rest
}

/** ⌘-click on a grouped node: mutes or unmutes it within its group. */
export function toggleMemberMute(clusters: readonly ClusterNode[], id: string): ClusterNode[] {
  return clusters.map((cluster) => {
    if (!cluster.members.includes(id)) return cluster
    const muted = cluster.muted ?? []
    return withMuted(cluster, muted.includes(id) ? muted.filter((m) => m !== id) : [...muted, id])
  })
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
  // Members muted in the groups they come from stay muted.
  const muted = clusters.flatMap((c) => c.muted ?? []).filter((id) => grouped.has(id))
  return [
    ...pruneClusters(
      clusters.map((c) => ({ ...c, members: c.members.filter((id) => !grouped.has(id)) })),
    ),
    withMuted({ ...cluster, members }, muted),
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
    if (members.length === cluster.members.length) return [cluster]
    return [withMuted({ ...cluster, members }, cluster.muted ?? [])]
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
    const expanded = cluster
      ? cluster.members.map((from) =>
          !link.muted && cluster.muted?.includes(from)
            ? { ...link, from, muted: true }
            : { ...link, from },
        )
      : [link]
    for (const item of expanded) {
      const key = `${item.from}→${item.to}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

/**
 * ⌘G on nodes that all feed one artboard: their links to it become one link from the new
 * cluster (placed where the first of them was), so the artboard's modifiers are unchanged.
 * Only when every member links to that one target and nothing else, all muted alike;
 * otherwise null (the links stay as they are).
 */
export function rewireToCluster(
  links: readonly NodeLink[],
  members: readonly string[],
  clusterId: string,
): NodeLink[] | null {
  const grouped = new Set(members)
  const outgoing = links.filter((link) => grouped.has(link.from))
  const [first] = outgoing
  if (!first || outgoing.some((link) => link.to !== first.to)) return null
  const linked = new Set(outgoing.map((link) => link.from))
  if (members.some((id) => !linked.has(id))) return null
  const muted = Boolean(first.muted)
  if (outgoing.some((link) => Boolean(link.muted) !== muted)) return null
  const rest = links.filter((link) => !grouped.has(link.from) && link.from !== clusterId)
  const at = links.slice(0, links.indexOf(first)).filter((link) => rest.includes(link)).length
  const cluster: NodeLink = { from: clusterId, to: first.to, ...(muted && { muted }) }
  return [...rest.slice(0, at), cluster, ...rest.slice(at)]
}

/**
 * ⌘G: groups the selection. Nodes in a group have no links of their own: the group's links
 * stand for them.
 * - With a group selected, the first one selected takes in the other selected groups and
 *   nodes, keeping its id, name and links; the other groups' links move to it (once per
 *   target), and the nodes' own links are dropped.
 * - Otherwise, a new group (`create`) of the selected nodes; if they all fed one artboard it
 *   feeds it instead (`rewireToCluster`), otherwise their links are dropped.
 * Null when there's nothing to group (or the selection is already one group, as is).
 */
export function groupSelected(
  clusters: readonly ClusterNode[],
  links: readonly NodeLink[],
  selected: readonly string[],
  /** The modifier nodes, in canvas order (the only nodes that can be grouped). */
  order: readonly string[],
  create: () => { id: string; name: string },
): { clusters: ClusterNode[]; links: NodeLink[]; id: string } | null {
  const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]))
  const groups = selected.flatMap((id) => byId.get(id) ?? [])
  const modifiers = new Set(order)
  const nodes = selected.filter((id) => modifiers.has(id))
  const [target] = groups
  const members = new Set([...groups.flatMap((group) => group.members), ...nodes])
  if (!members.size) return null
  if (target && groups.length === 1 && [...members].every((id) => target.members.includes(id)))
    return null
  const group = target ?? create()
  const ids = order.filter((id) => members.has(id))
  let next: NodeLink[]
  if (target) {
    const absorbed = new Set(groups.slice(1).map((item) => item.id))
    const seen = new Set<string>()
    next = links.flatMap((link) => {
      if (members.has(link.from)) return []
      const moved = absorbed.has(link.from) ? { ...link, from: target.id } : link
      if (moved.from !== target.id) return [moved]
      if (seen.has(moved.to)) return []
      seen.add(moved.to)
      return [moved]
    })
  } else {
    next = rewireToCluster(links, ids, group.id) ?? links.filter((link) => !members.has(link.from))
  }
  return {
    clusters: groupNodes(clusters, ids, { id: group.id, name: group.name }, order),
    links: next,
    id: group.id,
  }
}

/** A group's part of a copy: its copied members, and whether the group itself was copied. */
export interface CopiedGroup {
  id: string
  members: string[]
  /** The group was selected, not just some of its nodes: its copies make a new group. */
  whole: boolean
}

/** The groups of the nodes being copied (`copied`), for `pasteGroups`. */
export function copiedGroups(
  clusters: readonly ClusterNode[],
  selected: readonly string[],
  copied: ReadonlySet<string>,
): CopiedGroup[] {
  return clusters.flatMap((cluster) => {
    const members = cluster.members.filter((id) => copied.has(id))
    return members.length ? [{ id: cluster.id, members, whole: selected.includes(cluster.id) }] : []
  })
}

/**
 * Copies of grouped nodes stay grouped: they join their group (if it's still there), and
 * copies of a whole group make a new group (`create`). `remap`: original id → copy's id;
 * `order`: the modifier nodes in canvas order, copies included.
 */
export function pasteGroups(
  clusters: readonly ClusterNode[],
  groups: readonly CopiedGroup[],
  remap: ReadonlyMap<string, string>,
  order: readonly string[],
  create: () => { id: string; name: string },
): ClusterNode[] {
  let next = [...clusters]
  for (const group of groups) {
    const copies = group.members.flatMap((id) => remap.get(id) ?? [])
    if (!copies.length) continue
    const existing = next.find((cluster) => cluster.id === group.id)
    if (group.whole || !existing) {
      if (group.whole)
        next = [...next, { ...create(), members: order.filter((id) => copies.includes(id)) }]
      continue
    }
    const members = new Set([...existing.members, ...copies])
    next = next.map((cluster) =>
      cluster === existing
        ? { ...cluster, members: order.filter((id) => members.has(id)) }
        : cluster,
    )
  }
  return next
}
