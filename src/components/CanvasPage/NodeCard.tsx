import { memo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { PatternStatus } from '../../hooks'
import type { EtchParams, PatternParams, TwistParams } from '../../types'
import { EtchFields } from './EtchFields'
import type { ModifierNode } from './graph'
import { PatternFields } from './PatternFields'
import { TwistFields } from './TwistFields'

/** A node's field edit: a patch of its params. */
export type ParamsPatch = Partial<TwistParams> | Partial<EtchParams> | Partial<PatternParams>

/** Where a press edits rather than drags the node. */
const EDITABLE = 'textarea, input, select, button, a, [data-port]'

interface NodeCardProps {
  node: ModifierNode
  selected: boolean
  /** The canvas's zoom now, for converting drags to canvas px (a getter, so zooming doesn't
   *  re-render the card). */
  getZoom: () => number
  /** Linked to at least one scene. */
  connected: boolean
  /** A pattern node's map as it's being made. */
  pattern?: PatternStatus
  /** Zoomed out so far the card is small: show only its header. */
  compact: boolean
  onCollapsedChange: (id: string, collapsed: boolean) => void
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onParamsChange: (id: string, patch: ParamsPatch) => void
  /** A press on its output port: starts dragging a link from it. */
  onOutputDown: (id: string, e: ReactPointerEvent) => void
}

/**
 * A modifier node (twist, etch, pattern): a card with its fields and an output port at its
 * header's right end to drag onto scenes' inputs. Full size on screen down to
 * CARD_FULL_ZOOM, then shrinking with the canvas, and only its header when small (`compact`)
 * or folded. Dragging the card (not a field) moves it.
 */
export const NodeCard = memo(function NodeCard({
  node,
  selected,
  getZoom,
  connected,
  pattern,
  compact,
  onCollapsedChange,
  onSelect,
  onMove,
  onParamsChange,
  onOutputDown,
}: NodeCardProps) {
  const drag = useRef<{ id: number; x: number; y: number; nodeX: number; nodeY: number } | null>(
    null,
  )
  const { id } = node
  const set = (patch: ParamsPatch) => onParamsChange(id, patch)

  return (
    <div
      className="canvas-node"
      data-canvas-node
      data-node-id={id}
      data-kind={node.kind}
      data-no-pan
      data-selected={selected || undefined}
      data-compact={compact || node.collapsed || undefined}
      style={{ left: node.x, top: node.y }}
    >
      <div
        className="node-card"
        role="group"
        aria-label={node.name}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          onSelect(id)
          if ((e.target as Element).closest(EDITABLE)) return
          e.preventDefault()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            nodeX: node.x,
            nodeY: node.y,
          }
        }}
        onPointerMove={(e) => {
          const start = drag.current
          if (!start || e.pointerId !== start.id) return
          const zoom = getZoom()
          onMove(
            id,
            start.nodeX + (e.clientX - start.x) / zoom,
            start.nodeY + (e.clientY - start.y) / zoom,
          )
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="node-card-header">
          <button
            type="button"
            className="node-card-fold"
            aria-label={node.collapsed ? `expand ${node.name}` : `collapse ${node.name}`}
            aria-expanded={!node.collapsed}
            onClick={() => onCollapsedChange(id, !node.collapsed)}
          >
            {node.collapsed ? '+' : '−'}
          </button>
          {node.name}
          <span
            className="node-port node-port-out"
            data-port="out"
            data-connected={connected || undefined}
            aria-label={`${node.name} output`}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              onSelect(id)
              onOutputDown(id, e)
            }}
          />
        </div>
        {/* Fields only when shown (a card's fields are most of its DOM). */}
        {!node.collapsed && !compact && (
          <div className="node-card-body">
            {node.kind === 'twist' ? (
              <TwistFields params={node.params} set={set} />
            ) : node.kind === 'etch' ? (
              <EtchFields params={node.params} set={set} />
            ) : (
              <PatternFields params={node.params} set={set} status={pattern} />
            )}
          </div>
        )}
      </div>
    </div>
  )
})
