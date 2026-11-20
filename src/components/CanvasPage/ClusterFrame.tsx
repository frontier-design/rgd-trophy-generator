import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { CLUSTER_FRAME, type ClusterNode, type Rect } from './cluster'
import { useNodeDrag, useNodePosition } from './nodeDrag'

interface ClusterFrameProps {
  cluster: ClusterNode
  /** Its frame around the members' cards (canvas px). */
  bounds: Rect
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
}

/**
 * A cluster's frame, behind its members' cards: a header to select it and drag it (moving
 * every member with it) and, at the header's right end, the cluster's one output port. The
 * body lets presses through to the cards inside.
 */
export const ClusterFrame = memo(function ClusterFrame({
  cluster,
  bounds,
  scale,
  selected,
  connected,
  getZoom,
  onSelect,
  onMove,
  onOutputDown,
}: ClusterFrameProps) {
  const { id } = cluster
  const anchor = { id, x: bounds.x, y: bounds.y }
  const position = useNodePosition(id, anchor)
  const drag = useNodeDrag(anchor, getZoom, onMove)
  const header = CLUSTER_FRAME.header * scale
  return (
    <div
      className="cluster-frame"
      data-cluster-id={id}
      data-selected={selected || undefined}
      data-no-pan
      style={
        {
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height,
          transform:
            position === anchor
              ? undefined
              : `translate(${position.x - bounds.x}px, ${position.y - bounds.y}px)`,
          '--cluster-header': `${header}px`,
          '--cluster-scale': scale,
        } as CSSProperties
      }
    >
      <div
        className="cluster-frame-header"
        role="group"
        aria-label={cluster.name}
        {...drag}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          if ((e.target as Element).closest('[data-port]')) return
          onSelect(id, e.shiftKey, true)
          if (!e.shiftKey) drag.onPointerDown(e)
        }}
      >
        <span className="cluster-frame-name">{cluster.name}</span>
        <span className="cluster-frame-count">{cluster.members.length}</span>
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
