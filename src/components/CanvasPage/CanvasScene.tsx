import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { renderImage } from '../../export'
import { useSceneModel } from '../../hooks'
import type { ThreeScene } from '../../render3d'
import type { PaperScene } from '../../shape2d'
import { SceneArtboard } from '../SceneArtboard'
import { bannerLogo, composeScene } from '../SceneArtboard/composeScene'
import type { SceneModifiers } from './graph'
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

/** Where a press edits rather than drags the scene. */
const EDITABLE = 'textarea, input, select, button, a, [data-port], [data-handle]'

interface CanvasSceneProps {
  node: SceneNode
  selected: boolean
  /** The canvas's zoom now, for converting drags to canvas px. */
  getZoom: () => number
  /** The zoom the 3D view renders at: settled after zooming (re-allocating the canvas on
   *  every wheel tick is heavy), so the scene doesn't re-render while zooming. */
  renderZoom: number
  /** The nodes linked to its input: twists shaping its trophy, etches engraving it,
   *  patterns ornamenting it. */
  modifiers: SceneModifiers
  onSelect: (id: string) => void
  /** A press on its input port (picks up its last link, to move or drop it). */
  onInputDown: (id: string, e: ReactPointerEvent) => void
  onMove: (id: string, x: number, y: number) => void
  onTextChange: (id: string, text: string) => void
  /** Receives the scene's image exporter (null when it unmounts); referentially stable. */
  onExporter: (id: string, exporter: SceneExporter | null) => void
  /** Dragging a resize handle: the frame's new place and size. */
  onResize: (id: string, frame: FrameRect) => void
}

/**
 * A scene on the canvas, like a node: the generator's artboard (trophy, text, banner) at its
 * own frame size, at its place (selected: resize handles on its edges and its size beside
 * them; Shift keeps its proportions), with its name above and an input port on its left side, where
 * modifier nodes (twist, etch) link in. Pressing it selects it (its controls appear beside it);
 * dragging it anywhere but the text moves it; the text edits as in the generator. Memoized,
 * so panning the canvas doesn't re-render it.
 */
export const CanvasScene = memo(function CanvasScene({
  node,
  selected,
  getZoom,
  renderZoom,
  modifiers,
  onSelect,
  onInputDown,
  onMove,
  onTextChange,
  onExporter,
  onResize,
}: CanvasSceneProps) {
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
  const { settings, scene, bannerPosition, bannerText, frame } = node
  const model = useSceneModel(
    settings,
    scene,
    bannerPosition,
    bannerText,
    { editorRef, artboardRef },
    frame,
  )
  // The 3D view renders at the size it's shown at (capped, as in the generator).
  // Rounded to quarter steps, so small zoom changes keep the same buffers.
  const pixelRatio = Math.min(
    3,
    Math.max(0.5, Math.round(window.devicePixelRatio * renderZoom * 4) / 4),
  )
  const drag = useRef<{ id: number; x: number; y: number; nodeX: number; nodeY: number } | null>(
    null,
  )
  const resizing = useRef<{
    id: number
    edge: Edge
    x: number
    y: number
    start: FrameRect
  } | null>(null)
  const { id } = node
  const setText = useCallback((text: string) => onTextChange(id, text), [onTextChange, id])

  // The image exporter: the frame as it is now, at a scale (the 3D view rendered at it, then
  // put back to its display resolution).
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
        // (Drawn right away, inside renderImage: WebGL doesn't keep its buffer.)
        return await renderImage(composition, scale, format)
      } finally {
        threeRef.current?.setPixelRatio(pixelRatio)
      }
    })
    return () => onExporter(id, null)
  }, [id, onExporter])

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
          '--artboard-width': `${frame.width}px`,
          '--artboard-height': `${frame.height}px`,
          '--artboard-scale': 1,
        } as CSSProperties
      }
      onPointerDown={(e) => {
        if (e.button !== 0) return
        onSelect(id)
        if ((e.target as Element).closest(EDITABLE)) return
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y }
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
                // (No active pointer, e.g. a synthetic event: the drag works without it.)
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
              const drag = resizing.current
              if (!drag || e.pointerId !== drag.id) return
              const zoom = getZoom()
              onResize(
                id,
                resizeFrame(
                  drag.start,
                  drag.edge,
                  (e.clientX - drag.x) / zoom,
                  (e.clientY - drag.y) / zoom,
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
          onInputDown(id, e)
        }}
      />
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
        patterns={modifiers.patterns}
        onTextChange={setText}
        onPaperScene={setPaper}
        onThreeScene={setThree}
      />
    </div>
  )
})
