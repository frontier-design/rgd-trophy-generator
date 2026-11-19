import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { renderImage } from '../../export'
import { useSceneModel } from '../../hooks'
import type { ThreeScene } from '../../render3d'
import { outlineToLatheProfiles } from '../../render3d/revolve'
import type { Outline2D } from '../../types'
import { ModifierRangeOverlay } from './ModifierRangeOverlay'
import type { PaperScene } from '../../shape2d'
import { SceneArtboard } from '../SceneArtboard'
import { bannerLogo, composeScene } from '../SceneArtboard/composeScene'
import type { ModifierNode, SceneModifiers } from './graph'
import { useNodeDrag, useNodePosition } from './nodeDrag'
import {
  FRAME_EDGES as EDGES,
  resizeFrame,
  type FrameEdge as Edge,
  type FrameRect,
  type ImageExportOptions,
  type SceneNode,
} from './sceneNode'

/** Renders a scene's frame as an image file's contents. */
export type SceneExporter = (options: ImageExportOptions) => Promise<Blob>

const EDITABLE = 'textarea, input, select, button, a, [data-port], [data-handle]'
const EMPTY_RANGE_MODIFIERS: readonly ModifierNode[] = []

interface CanvasSceneProps {
  node: SceneNode
  selected: boolean
  getZoom: () => number
  /** Settled zoom: don't resize the WebGL buffer on every wheel event. */
  renderZoom: number
  modifiers: SceneModifiers
  rangeModifiers?: readonly ModifierNode[]
  onRangeChange?: (id: string, patch: { from?: number; to?: number }) => void
  onRangeBoundary?: () => void
  onSelect: (id: string, additive?: boolean, preserveGroup?: boolean) => void
  onInputDown: (id: string, e: ReactPointerEvent) => void
  onMove: (id: string, x: number, y: number) => void
  onTextChange: (id: string, text: string) => void
  onExporter: (id: string, exporter: SceneExporter | null) => void
  onResize: (id: string, frame: FrameRect) => void
}

interface RangeBounds {
  top: number
  height: number
}

/** Artwork inputs deliberately exclude board position, selection, name and export options. */
type ArtworkNode = Pick<
  SceneNode,
  | 'id'
  | 'settings'
  | 'scene'
  | 'bannerPosition'
  | 'bannerText'
  | 'frame'
  | 'revolve'
  | 'animateRevolve'
  | 'perspective'
  | 'debug'
>

/** A lightweight movable frame. Its artwork is separately memoized, so board movement,
 * selection and range-handle visibility never re-run text measurement or scene rendering. */
export const CanvasScene = memo(function CanvasScene({
  node,
  selected,
  getZoom,
  renderZoom,
  modifiers,
  rangeModifiers = EMPTY_RANGE_MODIFIERS,
  onRangeChange,
  onRangeBoundary,
  onSelect,
  onInputDown,
  onMove,
  onTextChange,
  onExporter,
  onResize,
}: CanvasSceneProps) {
  const {
    id,
    settings,
    scene,
    bannerPosition,
    bannerText,
    frame,
    revolve,
    animateRevolve,
    perspective,
    debug,
  } = node
  const artwork = useMemo<ArtworkNode>(
    () => ({
      id,
      settings,
      scene,
      bannerPosition,
      bannerText,
      frame,
      revolve,
      animateRevolve,
      perspective,
      debug,
    }),
    [
      id,
      settings,
      scene,
      bannerPosition,
      bannerText,
      frame,
      revolve,
      animateRevolve,
      perspective,
      debug,
    ],
  )
  const position = useNodePosition(id, node)
  const drag = useNodeDrag(node, getZoom, onMove)
  const resizing = useRef<{
    id: number
    edge: Edge
    x: number
    y: number
    start: FrameRect
  } | null>(null)
  const [rangeBounds, setRangeBounds] = useState<RangeBounds | null>(null)

  return (
    <div
      className="canvas-scene"
      aria-label={node.name}
      data-scene-node
      data-scene-id={id}
      data-no-pan
      data-selected={selected || undefined}
      style={
        {
          left: node.x,
          top: node.y,
          transform:
            position === node
              ? undefined
              : `translate(${position.x - node.x}px, ${position.y - node.y}px)`,
          '--artboard-width': `${frame.width}px`,
          '--artboard-height': `${frame.height}px`,
          '--artboard-scale': 1,
        } as CSSProperties
      }
      {...drag}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const editable = Boolean((e.target as Element).closest(EDITABLE))
        onSelect(id, e.shiftKey, !editable)
        if (e.shiftKey || editable) return
        drag.onPointerDown(e)
      }}
    >
      <div className="canvas-scene-name">{node.name}</div>
      {selected &&
        EDGES.map((edge) => (
          <span
            key={edge}
            className="frame-handle"
            data-edge={edge}
            data-handle
            role="slider"
            aria-label={`resize ${edge}`}
            aria-valuenow={edge === 'left' || edge === 'right' ? frame.width : frame.height}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              e.preventDefault()
              try {
                e.currentTarget.setPointerCapture?.(e.pointerId)
              } catch {
                // Synthetic events need not have an active browser pointer.
              }
              resizing.current = {
                id: e.pointerId,
                edge,
                x: e.clientX,
                y: e.clientY,
                start: { x: node.x, y: node.y, width: frame.width, height: frame.height },
              }
            }}
            onPointerMove={(e) => {
              const start = resizing.current
              if (!start || e.pointerId !== start.id) return
              const zoom = getZoom()
              onResize(
                id,
                resizeFrame(
                  start.start,
                  start.edge,
                  (e.clientX - start.x) / zoom,
                  (e.clientY - start.y) / zoom,
                  e.shiftKey,
                ),
              )
            }}
            onPointerUp={() => (resizing.current = null)}
            onPointerCancel={() => (resizing.current = null)}
          />
        ))}
      {selected && (
        <>
          <span className="frame-size" data-axis="width">
            {frame.width}
          </span>
          <span className="frame-size" data-axis="height">
            {frame.height}
          </span>
        </>
      )}
      <span
        className="node-port node-port-in"
        data-port="in"
        data-scene-id={id}
        data-connected={modifiers.linked || undefined}
        aria-label={`${node.name} input`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          if (e.shiftKey) onSelect(id, true)
          else onInputDown(id, e)
        }}
      />
      <SceneArtwork
        node={artwork}
        renderZoom={renderZoom}
        modifiers={modifiers}
        onTextChange={onTextChange}
        onExporter={onExporter}
        onRangeBounds={setRangeBounds}
      />
      {revolve &&
        rangeBounds &&
        rangeBounds.height > 0 &&
        rangeModifiers.map((rangeModifier, index) => (
          <ModifierRangeOverlay
            key={rangeModifier.id}
            {...rangeBounds}
            from={rangeModifier.params.from}
            to={rangeModifier.params.to}
            label={rangeModifier.name}
            index={index + 1}
            onChange={(patch) => onRangeChange?.(rangeModifier.id, patch)}
            onGestureBoundary={onRangeBoundary}
          />
        ))}
    </div>
  )
})

const SceneArtwork = memo(function SceneArtwork({
  node,
  renderZoom,
  modifiers,
  onTextChange,
  onExporter,
  onRangeBounds,
}: {
  node: ArtworkNode
  renderZoom: number
  modifiers: SceneModifiers
  onTextChange: CanvasSceneProps['onTextChange']
  onExporter: CanvasSceneProps['onExporter']
  onRangeBounds: (bounds: RangeBounds | null) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const threeRef = useRef<ThreeScene | null>(null)
  const paperRef = useRef<PaperScene | null>(null)
  const setThree = useCallback((s: ThreeScene | null) => {
    threeRef.current = s
  }, [])
  const setPaper = useCallback((s: PaperScene | null) => {
    paperRef.current = s
  }, [])
  const { id, settings, scene, bannerPosition, bannerText, frame } = node
  const model = useSceneModel(
    settings,
    scene,
    bannerPosition,
    bannerText,
    { editorRef, artboardRef },
    frame,
  )
  const pixelRatio = Math.min(
    3,
    Math.max(0.5, Math.round(window.devicePixelRatio * renderZoom * 4) / 4),
  )
  const [outline, setOutline] = useState<Outline2D | null>(null)
  useEffect(() => {
    const points = outline ? outlineToLatheProfiles(outline, settings.columnWidth).flat() : []
    if (!points.length) {
      onRangeBounds(null)
      return
    }
    const top = -Math.max(...points.map((point) => point.y)) + model.anchor.y
    const bottom = -Math.min(...points.map((point) => point.y)) + model.anchor.y
    onRangeBounds({ top, height: bottom - top })
  }, [outline, settings.columnWidth, model.anchor.y, onRangeBounds])
  const setText = useCallback((text: string) => onTextChange(id, text), [onTextChange, id])

  const latest = useRef({ model, node, pixelRatio })
  useEffect(() => {
    latest.current = { model, node, pixelRatio }
  })
  useEffect(() => {
    onExporter(id, async ({ format, scale, transparent }) => {
      const editor = editorRef.current
      const artboard = artboardRef.current
      if (!editor || !artboard) throw new Error('The scene is still loading')
      const { model, node, pixelRatio } = latest.current
      try {
        const composition = composeScene({
          editor,
          artboard,
          frame: node.frame,
          lines: model.lines,
          reveals: model.reveals,
          prefixWidths: model.prefixWidths,
          baselines: model.baselines,
          settings: node.settings,
          scene: node.scene,
          revolve: node.revolve,
          banner: model.banner,
          bannerText: node.bannerText,
          logo: bannerLogo(),
          three: threeRef.current,
          paper: paperRef.current,
          scale,
          transparent: format === 'png' && transparent,
        })
        return await renderImage(composition, scale, format)
      } finally {
        threeRef.current?.setPixelRatio(pixelRatio)
      }
    })
    return () => onExporter(id, null)
  }, [id, onExporter])

  return (
    <SceneArtboard
      editorRef={editorRef}
      artboardRef={artboardRef}
      model={model}
      settings={settings}
      scene={scene}
      bannerText={bannerText}
      revolve={node.revolve}
      animateRevolve={node.animateRevolve}
      perspective={node.perspective}
      debug={node.debug}
      pixelRatio={pixelRatio}
      twists={modifiers.twists}
      etches={modifiers.etches}
      textures={modifiers.textures}
      patterns={modifiers.patterns}
      onTextChange={setText}
      onOutline={setOutline}
      onPaperScene={setPaper}
      onThreeScene={setThree}
    />
  )
})
