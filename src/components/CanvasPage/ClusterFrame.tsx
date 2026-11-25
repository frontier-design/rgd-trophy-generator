import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  CLUSTER_FRAME,
  liveClusterBounds,
  type ClusterNode,
  type MemberRect,
  type Rect,
} from './cluster'
import { useNodeDrag, useNodePositions } from './nodeDrag'

interface ClusterFrameProps {
  cluster: ClusterNode
  /** Its frame around the members' cards (canvas px). */
  bounds: Rect
  /** The members' cards (canvas px), so the frame follows their drag previews live. */
  members: readonly MemberRect[]
  /** A card's on-canvas scale (cardScale(zoom) / zoom): the header and port scale like cards. */
  scale: number
  selected: boolean
  /** Its output is linked to at least one scene. */
  connected: boolean
  getZoom: () => number
  onSelect: (id: string, additive?: boolean, preserveGroup?: boolean) => void
  onMove: (id: string, x: number, y: number) => void
  /** A press on its output port: starts dragging a link from the cluster. */
  onOutputDown: (id: string, e: ReactPointerEvent) => void
  /** Every link from it is muted. */
  muted?: boolean
  /** ⌘-click on its header: mutes (or unmutes) its outgoing links, like a node's. */
  onToggleMute?: (id: string) => void
  /** The ↓ button: stacks its members one under another, by their ranges. */
  onArrange?: (id: string) => void
}

/**
 * A cluster's frame, behind its members' cards: a header to select it and drag it (moving
 * every member with it) and, at the header's right end, the cluster's one output port. The
 * body lets presses through to the cards inside.
 */
export const ClusterFrame = memo(function ClusterFrame({
  cluster,
  bounds,
  members,
  scale,
  selected,
  connected,
  getZoom,
  onSelect,
  onMove,
  onOutputDown,
  muted,
  onToggleMute,
  onArrange,
}: ClusterFrameProps) {
  const { id } = cluster
  const anchor = { id, x: bounds.x, y: bounds.y }
  // Dragging the header previews every member too, so following them covers both drags.
  const previews = useNodePositions(members.map((member) => member.id))
  const live = liveClusterBounds(members, previews, scale) ?? bounds
  const drag = useNodeDrag(anchor, getZoom, onMove)
  const header = CLUSTER_FRAME.header * scale
  return (
    <div
      className="cluster-frame"
      data-cluster-id={id}
      data-selected={selected || undefined}
      data-muted={muted || undefined}
      data-no-pan
      style={
        {
          left: live.x,
          top: live.y,
          width: live.width,
          height: live.height,
          '--cluster-header': `${header}px`,
          '--cluster-scale': scale,
        } as CSSProperties
      }
    >
      <div
        className="cluster-frame-header"
        role="group"
        aria-label={cluster.name}
        title="Command-click to mute or unmute outgoing links"
        {...drag}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          if ((e.target as Element).closest('[data-port]')) return
          if (e.metaKey) return
          onSelect(id, e.shiftKey, true)
          if (!e.shiftKey) drag.onPointerDown(e)
        }}
        onClick={(e) => {
          if (e.metaKey && !(e.target as Element).closest('[data-port]')) {
            e.preventDefault()
            onToggleMute?.(id)
          }
        }}
      >
        <span className="cluster-frame-name">{cluster.name}</span>
        <span className="cluster-frame-count">{cluster.members.length}</span>
        {onArrange && (
          <button
            type="button"
            className="cluster-frame-arrange"
            aria-label={`arrange ${cluster.name}`}
            title="Stack the nodes by their from %, then to %"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onArrange(id)
            }}
          >
            ↓
          </button>
        )}
        <span
          className="node-port node-port-out"
          data-port="out"
          data-connected={connected || undefined}
          aria-label={`${cluster.name} output`}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.stopPropagation()
            onSelect(id)
            onOutputDown(id, e)
          }}
        />
      </div>
    </div>
  )
})
