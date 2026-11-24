import { memo, useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
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
import { EtchPreview, PatternPreview, TwistPreview } from './NodePreview'
import { PREVIEW_KINDS, type LightingParams, type ModifierNode, type ShapeParams } from './graph'
import { ShapeFields } from './ShapeFields'
import { LightingFields } from './LightingFields'
import type { MasterNode, MasterParams } from './master'
import { MasterFields } from './MasterFields'
import { PatternFields } from './PatternFields'
import { TextureFields } from './TextureFields'
import { TwistFields } from './TwistFields'
import { TextLinesField } from './TextLinesField'
import { FieldAnimContext, type FieldAnimControls } from '../ControlPanel/fieldAnim'
import {
  DEFAULT_EASING,
  EASINGS,
  routeEdit,
  shownParams,
  startAnim,
  type Easing,
  type ParamAnim,
  type ParamAnims,
} from './paramAnim'

/** The animation easings, as the anim row's dropdown lists them. */
const EASING_OPTIONS = EASINGS.map((value) => ({ value, label: value.replace('-', ' ') }))
import { BackspaceFields } from './BackspaceFields'
import { ToggleField } from '../ControlPanel/ToggleField'
import type { TextParams } from './textLines'
import { TextTypeFields } from './TextTypeFields'
import { NodeDivider } from './NodeView'
import { DEFAULT_SETTINGS } from '../../state'

/** A text node's type with no linked scene: the default settings'. */
const TEXT_TYPE_DEFAULT = {
  fontSize: DEFAULT_SETTINGS.fontSize,
  leading: DEFAULT_SETTINGS.lineHeight / DEFAULT_SETTINGS.fontSize,
}

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
  /** A text node's type before it sets its own: the first linked scene's size (px) and
   *  line height (× size). Numbers, so the card's memo holds. */
  typeFallbackSize?: number
  typeFallbackLeading?: number
  onTypingToggle?: (id: string) => void
  /** Zoomed out so far the card is small: show only its header. */
  compact: boolean
  onCollapsedChange: (id: string, collapsed: boolean) => void
  onSelect: (id: string, additive?: boolean, preserveGroup?: boolean) => void
  onMove: (id: string, x: number, y: number) => void
  onParamsChange: (id: string, patch: ParamsPatch) => void
  /** Its animated properties changed (a slider's anim controls, or an edit routed to an
   *  animated slider's from / to value). */
  onAnimsChange?: (id: string, anims: ParamAnims | undefined) => void
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
  typeFallbackSize = TEXT_TYPE_DEFAULT.fontSize,
  typeFallbackLeading = TEXT_TYPE_DEFAULT.leading,
  onTypingToggle,
  compact,
  onCollapsedChange,
  onSelect,
  onMove,
  onParamsChange,
  onAnimsChange,
  onOutputDown,
}: NodeCardProps) {
  const drag = useNodeDrag(node, getZoom, onMove)
  const position = useNodePosition(node.id, node)
  const { id, params } = node
  const kind = 'kind' in node ? node.kind : 'master'
  const isMaster = kind === 'master'
  // Modifier nodes' sliders can animate over a text line's typing (not the master's or the
  // text node's own). Animated sliders show, and edit, their from or to value.
  const animatable = !isMaster && kind !== 'text' && Boolean(onAnimsChange)
  const anims = animatable ? (node as ModifierNode).anims : undefined
  const shown = useMemo(() => shownParams(params, anims), [params, anims])
  const animControls = useMemo<FieldAnimControls | null>(() => {
    if (!animatable || !onAnimsChange) return null
    const update = (param: string, change: (anim: ParamAnim) => ParamAnim | null, value = 0) => {
      const next = change(anims?.[param] ?? startAnim(value))
      const all: Record<string, ParamAnim> = { ...(anims ?? {}) }
      if (next) all[param] = next
      else delete all[param]
      onAnimsChange(id, Object.keys(all).length ? all : undefined)
    }
    return {
      get: (param) => anims?.[param],
      setEnabled: (param, enabled, value) =>
        update(param, (anim) => (enabled ? { ...anim, enabled: true } : null), value),
      setLine: (param, line) => update(param, (anim) => ({ ...anim, line })),
      setEditing: (param, editing) => update(param, (anim) => ({ ...anim, editing })),
      easings: EASING_OPTIONS,
      setEasing: (param, easing) =>
        update(param, (anim) => {
          const { easing: _, ...rest } = anim
          return easing === DEFAULT_EASING ? rest : { ...rest, easing: easing as Easing }
        }),
    }
  }, [animatable, anims, id, onAnimsChange])
  const fields = useMemo(() => {
    const set = (patch: ParamsPatch) => {
      const routed = routeEdit(params, shown, patch as Record<string, unknown>, anims)
      if (routed.anims !== anims) onAnimsChange?.(id, routed.anims)
      if (Object.keys(routed.params).length) onParamsChange(id, routed.params as ParamsPatch)
    }
    switch (kind) {
      case 'master':
        return <MasterFields params={params as MasterParams} set={set} />
      case 'shape':
        return <ShapeFields params={shown as ShapeParams} set={set} />
      case 'twist':
        return <TwistFields params={shown as TwistParams} set={set} />
      case 'etch':
        return <EtchFields params={shown as EtchParams} set={set} />
      case 'text':
        return (
          <>
            <TextTypeFields
              params={params as TextParams}
              fallback={{ fontSize: typeFallbackSize, leading: typeFallbackLeading }}
              set={set}
            />
            <NodeDivider />
            <TextLinesField
              lines={(params as TextParams).lines}
              onChange={(lines) => set({ lines })}
            />
            <NodeDivider />
            <BackspaceFields
              backspace={(params as TextParams).backspace}
              set={(backspace) => set({ backspace })}
            />
            <NodeDivider />
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
        return <LightingFields params={shown as LightingParams} set={set} />
      case 'material':
        return <MaterialFields params={shown as MaterialSettings} set={set} />
      case 'texture':
        return <TextureFields params={shown as TextureParams} set={set} />
      case 'pattern':
        return <PatternFields params={shown as PatternParams} set={set} status={pattern} />
    }
  }, [
    kind,
    params,
    shown,
    anims,
    id,
    onParamsChange,
    onAnimsChange,
    pattern,
    typingPlaying,
    onTypingToggle,
    typeFallbackSize,
    typeFallbackLeading,
  ])

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
      style={
        {
          left: node.x,
          top: node.y,
          transform:
            position === node
              ? undefined
              : `translate(${position.x - node.x}px, ${position.y - node.y}px)`,
          // The lighting node glows yellow: as strongly as its ambient, as blurred as its softness.
          ...(kind === 'lighting' ? lightingGlow(params as LightingParams) : {}),
        } as CSSProperties
      }
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
          <span className="node-card-name">{node.name}</span>
          {/* Twists, etches and patterns: a preview of what they draw, on the header's right. */}
          {PREVIEW_KINDS.has(kind) && (
            <span className="node-card-preview">
              {kind === 'twist' ? (
                <TwistPreview params={params as TwistParams} />
              ) : kind === 'etch' ? (
                <EtchPreview params={params as EtchParams} />
              ) : (
                <PatternPreview map={pattern?.map ?? null} />
              )}
            </span>
          )}
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
        {!node.collapsed && !compact && (
          <div className="node-card-body">
            <FieldAnimContext.Provider value={animControls}>{fields}</FieldAnimContext.Provider>
          </div>
        )}
      </div>
    </div>
  )
})

/** The lighting node's glow (CSS custom properties): ambient (0–1) sets its strength and
 *  spread, softness (0–1) its blur. */
function lightingGlow({ ambient, softness }: LightingParams) {
  const strength = Math.min(1, Math.max(0, ambient))
  return {
    '--glow-alpha': 0.2 + strength * 0.3,
    '--glow-spread': `${10 + strength * 30}px`,
    '--glow-blur': `${30 + Math.min(1, Math.max(0, softness)) * 120}px`,
  }
}
