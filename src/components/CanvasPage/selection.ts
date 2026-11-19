import type { ModifierNode, NodeLink } from './graph'
import type { SceneNode, FrameRect } from './sceneNode'
import type { CanvasDocument } from './canvasDocument'

export interface Selection {
  ids: readonly string[]
  activeId: string | null
}

export function clearSelection(): Selection {
  return { ids: [], activeId: null }
}

/** Replace with unique ids, in order. Invalid active ids fall back to the last id. */
export function replaceSelection(
  ids: readonly string[],
  activeId: string | null = null,
): Selection {
  const unique = [...new Set(ids)]
  return {
    ids: unique,
    activeId: activeId !== null && unique.includes(activeId) ? activeId : (unique.at(-1) ?? null),
  }
}

export function pickSelection(selection: Selection, id: string, additive = false): Selection {
  const selected = selection.ids.includes(id)
  if (!additive)
    return selected ? { ids: [...selection.ids], activeId: id } : replaceSelection([id], id)
  if (!selected) return replaceSelection([...selection.ids, id], id)
  const ids = selection.ids.filter((item) => item !== id)
  return replaceSelection(ids, selection.activeId === id ? null : selection.activeId)
}

export function pruneSelection(selection: Selection, validIds: Iterable<string>): Selection {
  const valid = new Set(validIds)
  return replaceSelection(
    selection.ids.filter((id) => valid.has(id)),
    selection.activeId,
  )
}

/** Normalize signed width and height (e.g. a marquee dragged up and left). */
export function normalizeRect(rect: FrameRect): FrameRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  }
}

/** Inclusive intersection in world coordinates, including touching edges. */
export function rectanglesIntersect(a: FrameRect, b: FrameRect): boolean {
  const x = normalizeRect(a),
    y = normalizeRect(b)
  return (
    x.x <= y.x + y.width && x.x + x.width >= y.x && x.y <= y.y + y.height && x.y + x.height >= y.y
  )
}

export interface CopiedSubgraph {
  scenes: SceneNode[]
  modifiers: ModifierNode[]
  links: NodeLink[]
  /** Selected cloneable ids in selection order. */
  ids: string[]
  activeId: string | null
}

/** Snapshot only actual scene/modifier nodes and links internal to that snapshot. */
export function copySelection(
  selection: Selection,
  scenes: readonly SceneNode[],
  modifiers: readonly ModifierNode[],
  links: readonly NodeLink[],
): CopiedSubgraph {
  const selected = new Set(selection.ids)
  const copiedScenes = scenes.filter((node) => selected.has(node.id))
  const copiedModifiers = modifiers.filter((node) => selected.has(node.id))
  const available = new Set([...copiedScenes, ...copiedModifiers].map((node) => node.id))
  const ids = selection.ids.filter((id) => available.has(id))
  return structuredClone({
    scenes: copiedScenes,
    modifiers: copiedModifiers,
    links: links.filter(({ from, to }) => available.has(from) && available.has(to)),
    ids,
    activeId:
      selection.activeId && available.has(selection.activeId)
        ? selection.activeId
        : (ids.at(-1) ?? null),
  })
}

export type InsertedCounters = CanvasDocument['inserted']
export type PastePlacement = { at: { x: number; y: number } } | { offset: { x: number; y: number } }
export interface PastedSubgraph extends Selection {
  scenes: SceneNode[]
  modifiers: ModifierNode[]
  links: NodeLink[]
  inserted: InsertedCounters
}

/** Place the snapshot's bounding top-left at `at`, or translate all nodes by `offset`.
 * Pass the latest counters on every invocation, including after undo, to avoid reusing ids. */
export function pasteSelection(
  copy: CopiedSubgraph,
  counters: Omit<InsertedCounters, 'material' | 'text'> &
    Partial<Pick<InsertedCounters, 'material' | 'text'>>,
  placement: PastePlacement,
): PastedSubgraph {
  const snapshot = structuredClone(copy)
  const nodes = [...snapshot.scenes, ...snapshot.modifiers]
  const minX = nodes.length ? Math.min(...nodes.map((node) => node.x)) : 0
  const minY = nodes.length ? Math.min(...nodes.map((node) => node.y)) : 0
  const delta =
    'at' in placement ? { x: placement.at.x - minX, y: placement.at.y - minY } : placement.offset
  const inserted = { material: 0, text: 0, ...counters }
  const remap = new Map<string, string>()
  const allocate = (id: string, kind: keyof InsertedCounters) => {
    const count = ++inserted[kind]
    const nextId = `${kind}-${count}`
    remap.set(id, nextId)
    return { id: nextId, name: `${kind} ${count}` }
  }
  const scenes = snapshot.scenes.map((node) => ({
    ...node,
    ...allocate(node.id, 'scene'),
    x: node.x + delta.x,
    y: node.y + delta.y,
    animateRevolve: false,
  }))
  const modifiers = snapshot.modifiers.map((node): ModifierNode => ({
    ...node,
    ...allocate(node.id, node.kind),
    x: node.x + delta.x,
    y: node.y + delta.y,
  }))
  const links = snapshot.links.flatMap(({ from, to }) => {
    const newFrom = remap.get(from),
      newTo = remap.get(to)
    return newFrom && newTo ? [{ from: newFrom, to: newTo }] : []
  })
  const ids = snapshot.ids.flatMap((id) => {
    const next = remap.get(id)
    return next ? [next] : []
  })
  const activeId = (snapshot.activeId && remap.get(snapshot.activeId)) || ids.at(-1) || null
  return { scenes, modifiers, links, inserted, ids, activeId }
}
