import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
} from 'react'

export interface NodePosition {
  x: number
  y: number
}

/** Transient board positions, separate from scene inputs and the saved document. Only
 * subscribers to the moved node are notified, at most once per animation frame. */
export function createNodePositionStore() {
  const positions = new Map<string, NodePosition>()
  const pending = new Map<string, NodePosition>()
  const listeners = new Map<string, Set<() => void>>()
  let frame: number | undefined
  let revision = 0
  const notify = (id: string) => [...(listeners.get(id) ?? [])].forEach((listener) => listener())
  const flush = () => {
    frame = undefined
    const batch = [...pending]
    pending.clear()
    for (const [id, position] of batch) {
      const previous = positions.get(id)
      if (previous?.x === position.x && previous.y === position.y) continue
      positions.set(id, position)
      notify(id)
    }
  }
  return {
    get: (id: string) => positions.get(id),
    /** Disposal invalidates active gestures (Escape, undo, deletion, unmount). */
    revision: () => revision,
    subscribe(id: string, listener: () => void) {
      const subscriptions = listeners.get(id) ?? new Set()
      subscriptions.add(listener)
      listeners.set(id, subscriptions)
      return () => {
        subscriptions.delete(listener)
        if (!subscriptions.size) listeners.delete(id)
      }
    },
    preview(id: string, x: number, y: number) {
      pending.set(id, { x, y })
      frame ??= requestAnimationFrame(flush)
    },
    /** Read the latest pointer sample even when its animation frame hasn't run yet. */
    finish(id: string) {
      const last = pending.get(id) ?? positions.get(id)
      pending.delete(id)
      if (!pending.size && frame !== undefined) {
        cancelAnimationFrame(frame)
        frame = undefined
      }
      if (positions.delete(id)) notify(id)
      return last
    },
    dispose() {
      revision++
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      pending.clear()
      const ids = [...positions.keys()]
      positions.clear()
      ids.forEach(notify)
    },
  }
}

export type NodePositionStore = ReturnType<typeof createNodePositionStore>
export const NodeDragContext = createContext<{
  positions: NodePositionStore
  checkpoint: () => void
  participants?: (id: string) => readonly (NodePosition & { id: string })[]
  commit?: (moves: ReadonlyMap<string, NodePosition>) => void
  /** Option/Alt-drag: copies of the dragged nodes, moved by `offset`; the originals stay. */
  duplicate?: (ids: readonly string[], offset: NodePosition) => void
  onTap?: (id: string) => void
} | null>(null)

const noPosition = () => undefined

/** Only the lightweight node wrapper / incident edge subscribes to a drag preview. */
export function useNodePosition(id: string, fallback: NodePosition) {
  const controller = useContext(NodeDragContext)
  const subscribe = useCallback(
    (listener: () => void) => controller?.positions.subscribe(id, listener) ?? (() => {}),
    [controller, id],
  )
  const snapshot = useCallback(() => controller?.positions.get(id), [controller, id])
  return useSyncExternalStore(subscribe, snapshot, noPosition) ?? fallback
}

/** Share pointer ownership and preview/commit semantics between scenes and node cards. */
export function useNodeDrag(
  node: NodePosition & { id: string },
  getZoom: () => number,
  onMove: (id: string, x: number, y: number) => void,
) {
  const controller = useContext(NodeDragContext)
  const drag = useRef<{
    pointer: number
    clientX: number
    clientY: number
    origin: NodePosition
    participants: readonly (NodePosition & { id: string })[]
    revision: number | undefined
    moved: boolean
    /** Option/Alt was held at the press. */
    duplicate: boolean
  } | null>(null)
  const { id, x, y } = node
  useEffect(
    () => () => {
      const participants = drag.current?.participants ?? [{ id }]
      participants.forEach((node) => controller?.positions.finish(node.id))
      drag.current = null
    },
    [controller, id],
  )

  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const start = drag.current
    if (!start || start.pointer !== event.pointerId) return
    drag.current = null
    const changes = new Map<string, NodePosition>()
    for (const origin of start.participants) {
      const last = controller?.positions.finish(origin.id)
      if (last && (last.x !== origin.x || last.y !== origin.y)) changes.set(origin.id, last)
    }
    if (cancelled || start.revision !== controller?.positions.revision()) return
    if (!start.moved) {
      controller?.onTap?.(id)
      return
    }
    // Option/Alt (at the press or the drop): the originals go back, copies land here.
    const last = changes.get(id)
    if ((start.duplicate || event.altKey) && controller?.duplicate && last) {
      controller.duplicate(
        start.participants.map((node) => node.id),
        { x: last.x - start.origin.x, y: last.y - start.origin.y },
      )
      return
    }
    if (changes.size && controller?.commit) controller.commit(changes)
    else if (last) onMove(id, last.x, last.y)
  }
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return
      event.preventDefault()
      // The press doesn't move focus (preventDefault): let go of a field focused elsewhere,
      // so the canvas's shortcuts (⌘C, ⌘V, Delete) apply to the pressed node.
      const active = document.activeElement
      if (active instanceof HTMLElement && !event.currentTarget.contains(active)) active.blur()
      controller?.checkpoint()
      drag.current = {
        pointer: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        origin: { x, y },
        participants: controller?.participants?.(id) ?? [{ id, x, y }],
        revision: controller?.positions.revision(),
        moved: false,
        duplicate: event.altKey,
      }
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // Synthetic pointer events may not have an active browser pointer.
      }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = drag.current
      if (
        !start ||
        start.pointer !== event.pointerId ||
        start.revision !== controller?.positions.revision()
      )
        return
      const dx = event.clientX - start.clientX
      const dy = event.clientY - start.clientY
      start.moved ||= Math.hypot(dx, dy) > 3
      if (!start.moved) return
      const zoom = getZoom()
      if (controller) {
        for (const node of start.participants)
          controller.positions.preview(node.id, node.x + dx / zoom, node.y + dy / zoom)
      } else onMove(id, start.origin.x + dx / zoom, start.origin.y + dy / zoom)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => end(event, false),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) end(event, true)
    },
  }
}
