import { memo, useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import { useNodeDrag, useNodePosition } from './nodeDrag'
import type { PatternStatus } from '../../hooks'
import type {
  EtchParams,
  PatternParams,
  TextureParams,
  TwistParams,
  MaterialSettings,
} from '../../types'
import { MaterialFields } from './MaterialFields'
import { paletteColors, paletteGradient } from '../../material'
import { EtchFields } from './EtchFields'
import type { LightingParams, ModifierNode, ShapeParams } from './graph'
import { ShapeFields } from './ShapeFields'
import { LightingFields } from './LightingFields'
import type { MasterNode, MasterParams } from './master'
import { MasterFields } from './MasterFields'
import { PatternFields } from './PatternFields'
import { TextureFields } from './TextureFields'
import { TwistFields } from './TwistFields'
import { TextLinesField } from './TextLinesField'
import { BackspaceFields } from './BackspaceFields'
import { ToggleField } from '../ControlPanel/ToggleField'
import type { TextParams } from './textLines'

/** A node's field edit: a patch of its params. */
export type ParamsPatch =
  | Partial<TwistParams>
  | Partial<EtchParams>
  | Partial<PatternParams>
  | Partial<TextureParams>
  | Partial<MasterParams>
  | Partial<MaterialSettings>
  | Partial<LightingParams>
  | Partial<ShapeParams>
  | Partial<TextParams>

/** Where a press edits rather than drags the node. */
const EDITABLE = 'textarea, input, select, button, a, [data-port]'

interface NodeCardProps {
  /** A modifier, or the master node (no output port: it applies to every scene). */
  node: ModifierNode | MasterNode
  selected: boolean
  /** The canvas's zoom now, for converting drags to canvas px (a getter, so zooming doesn't
   *  re-render the card). */
  getZoom: () => number
  /** Linked to at least one scene. */
  connected: boolean
  muted?: boolean
  /** In a group: no output port of its own (it links only through the group). */
  grouped?: boolean
  onToggleMute?: (id: string) => void
  /** A pattern node's map as it's being made. */
  pattern?: PatternStatus
  typingPlaying?: boolean
  onTypingToggle?: (id: string) => void
  /** Zoomed out so far the card is small: show only its header. */
  compact: boolean
  onCollapsedChange: (id: string, collapsed: boolean) => void
  onSelect: (id: string, additive?: boolean, preserveGroup?: boolean) => void
  onMove: (id: string, x: number, y: number) => void
  onParamsChange: (id: string, patch: ParamsPatch) => void
  /** A press on its output port: starts dragging a link from it. */
  onOutputDown: (id: string, e: ReactPointerEvent) => void
}

/**
 * A modifier node (twist, etch, pattern, texture): a card with its fields and an output port at its
 * header's right end to drag onto scenes' inputs. Full size on screen down to
 * CARD_FULL_ZOOM, then shrinking with the canvas, and only its header when small (`compact`)
 * or folded. Dragging the card (not a field) moves it.
 */
export const NodeCard = memo(function NodeCard({
  node,
  selected,
  getZoom,
  connected,
  grouped = false,
  muted,
  onToggleMute,
  pattern,
  typingPlaying,
  onTypingToggle,
  compact,
  onCollapsedChange,
  onSelect,
  onMove,
  onParamsChange,
  onOutputDown,
}: NodeCardProps) {
  const drag = useNodeDrag(node, getZoom, onMove)
  const position = useNodePosition(node.id, node)
  const { id, params } = node
  const kind = 'kind' in node ? node.kind : 'master'
  const isMaster = kind === 'master'
  const fields = useMemo(() => {
    const set = (patch: ParamsPatch) => onParamsChange(id, patch)
    switch (kind) {
      case 'master':
        return <MasterFields params={params as MasterParams} set={set} />
      case 'shape':
        return <ShapeFields params={params as ShapeParams} set={set} />
      case 'twist':
        return <TwistFields params={params as TwistParams} set={set} />
      case 'etch':
        return <EtchFields params={params as EtchParams} set={set} />
      case 'text':
        return (
          <>
            <TextLinesField
              lines={(params as TextParams).lines}
              onChange={(lines) => set({ lines })}
            />
            <BackspaceFields
              backspace={(params as TextParams).backspace}
              set={(backspace) => set({ backspace })}
            />
            <ToggleField
              label="mask"
              checked={(params as TextParams).mask === true}
              onChange={(mask) => set({ mask })}
            />
            <button
              type="button"
              className="control-button node-card-wide"
              onClick={() => onTypingToggle?.(id)}
            >
              {typingPlaying ? 'Stop typing' : 'Play typing'}
            </button>
          </>
        )
      case 'lighting':
        return <LightingFields params={params as LightingParams} set={set} />
      case 'material':
        return <MaterialFields params={params as MaterialSettings} set={set} />
      case 'texture':
        return <TextureFields params={params as TextureParams} set={set} />
      case 'pattern':
        return <PatternFields params={params as PatternParams} set={set} status={pattern} />
    }
  }, [kind, params, id, onParamsChange, pattern, typingPlaying, onTypingToggle])

  return (
    <div
      className="canvas-node"
      data-canvas-node
      data-node-id={id}
      data-kind={kind}
      data-no-pan
      data-selected={selected || undefined}
      data-muted={muted || undefined}
      data-grouped={grouped || undefined}
      data-compact={compact || node.collapsed || undefined}
      style={{
        left: node.x,
        top: node.y,
        transform:
          position === node
            ? undefined
            : `translate(${position.x - node.x}px, ${position.y - node.y}px)`,
      }}
    >
      <div
        className="node-card"
        role="group"
        aria-label={node.name}
        title={isMaster ? undefined : 'Command-click to mute or unmute outgoing links'}
        {...drag}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const editable = Boolean((e.target as Element).closest(EDITABLE))
          // ⌘-click mutes; Option+⌘-drag copies (outside the node's group).
          if (e.metaKey && !e.altKey && !editable && !isMaster) return
          onSelect(id, e.shiftKey, !editable)
          if (e.shiftKey || editable) return
          drag.onPointerDown(e)
        }}
        onClick={(e) => {
          if (e.metaKey && !e.altKey && !isMaster && !(e.target as Element).closest(EDITABLE)) {
            e.preventDefault()
            onToggleMute?.(id)
          }
        }}
      >
        <div
          className="node-card-header"
          // The material node's header shows its palette (the gradient its swatch has).
          style={
            kind === 'material'
              ? { background: paletteGradient(paletteColors(params as MaterialSettings)) }
              : undefined
          }
        >
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
          {isMaster ? (
            <span className="node-card-note">all scenes</span>
          ) : grouped ? null : (
            <span
              className="node-port node-port-out"
              data-port="out"
              data-connected={connected || undefined}
              aria-label={`${node.name} output`}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                onSelect(id, e.shiftKey, false)
                if (!e.shiftKey) onOutputDown(id, e)
              }}
            />
          )}
        </div>
        {/* Fields only when shown (a card's fields are most of its DOM). */}
        {!node.collapsed && !compact && <div className="node-card-body">{fields}</div>}
      </div>
    </div>
  )
})
