import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useSceneModel } from '../../hooks'
import { shapeLeft } from '../../rag'
import type { ThreeScene } from '../../render3d'
import { ARTBOARD, DEFAULT_BANNER_TEXT, DEFAULT_MATERIAL, DEFAULT_SCENE_PARAMS, DEFAULT_SETTINGS } from '../../state'
import type { MaterialSettings, SceneParams, Settings } from '../../types'
import { SceneArtboard } from '../SceneArtboard'
import { sceneMaterial, type SceneModifiers } from './graph'
import { useNodeDrag, useNodePosition } from './nodeDrag'
import {
  FRAME_EDGES,
  resizeFrame,
  type FrameEdge,
  type FrameRect,
  type ImageExportOptions,
} from './sceneNode'
import {
  drawRepeatArtwork,
  renderRepeatArtwork,
  repeatGrid,
  type RepeatArtwork,
  type RepeatTrophy,
} from './repeatArtwork'
import type { RepeatNode } from './repeatNode'
import type { SceneExporter } from './CanvasScene'

interface RepeatArtboardProps {
  node: RepeatNode
  selected: boolean
  getZoom: () => number
  /** Settled zoom, so the preview doesn't redraw on every wheel event. */
  renderZoom: number
  modifiers: SceneModifiers
  onSelect: (id: string, additive?: boolean, preserveGroup?: boolean) => void
  onInputDown: (id: string, event: ReactPointerEvent) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, frame: FrameRect) => void
  onLayoutChange: (id: string, patch: Partial<RepeatNode['layout']>) => void
  onExporter: (id: string, exporter: SceneExporter | null) => void
}

const NO_MODIFIERS: SceneModifiers = {
  twists: [],
  etches: [],
  textures: [],
  patterns: [],
  linked: false,
}

/** The source scene's frame: wide enough for the text's column plus the artboard's margins,
 *  tall enough for its lines, with room for the trophy above them. */
function sourceFrame(settings: RepeatNode['typography'], text: string) {
  const rows = Math.max(1, text.split('\n').length)
  const estimatedWrap = Math.max(1, Math.ceil(text.length / Math.max(8, settings.columnWidth / (settings.fontSize * 0.55))))
  const height = Math.max(
    360,
    Math.max(rows, estimatedWrap) * settings.lineHeight + 2 * ARTBOARD.padding + 80,
  )
  return { width: settings.columnWidth + 2 * ARTBOARD.padding, height: Math.min(10_000, height) }
}

/** A repeat artboard: one shared trophy render, tiled with centered text in the gaps. */
export const RepeatArtboard = memo(function RepeatArtboard({
  node,
  selected,
  getZoom,
  renderZoom,
  modifiers = NO_MODIFIERS,
  onSelect,
  onInputDown,
  onMove,
  onResize,
  onLayoutChange,
  onExporter,
}: RepeatArtboardProps) {
  const { id, frame, typography, layout } = node
  const position = useNodePosition(id, node)
  const drag = useNodeDrag(node, getZoom, onMove)
  const editorRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const threeRef = useRef<ThreeScene | null>(null)
  const [threeVersion, setThreeVersion] = useState(0)
  const setThree = useCallback((scene: ThreeScene | null) => {
    threeRef.current = scene
    if (scene) setThreeVersion((version) => version + 1)
  }, [])
  const endless = useRef<{
    pointer: number
    x: number
    y: number
    offsetX: number
    offsetY: number
  } | null>(null)

  const text = modifiers.text ?? ''
  const material = useMemo<MaterialSettings>(
    () => sceneMaterial(DEFAULT_MATERIAL, modifiers),
    [modifiers],
  )
  const sourceSettings = useMemo<Settings>(
    () => ({
      ...DEFAULT_SETTINGS,
      text,
      fontFamily: typography.fontFamily,
      fontWeight: DEFAULT_SETTINGS.fontWeight,
      fontSize: typography.fontSize,
      lineHeight: typography.lineHeight,
      columnWidth: typography.columnWidth,
      material,
    }),
    [text, typography, material],
  )
  const sourceScene = useMemo<SceneParams>(
    () => ({
      ...DEFAULT_SCENE_PARAMS,
      ...(modifiers.shape ?? {}),
      textAlign: 'center',
      mirror: false,
      banner: false,
      reveal: 100,
      revealFill: 0,
      canvasColors: { background: '#ffffff', text: '#111111' },
    }),
    [modifiers.shape],
  )
  const source = useMemo(() => sourceFrame(typography, text), [typography, text])
  const model = useSceneModel(
    sourceSettings,
    sourceScene,
    'bottom',
    DEFAULT_BANNER_TEXT,
    { editorRef, artboardRef },
    source,
  )

  const trophy = useMemo<RepeatTrophy>(() => {
    const left = model.anchor.x + shapeLeft(typography.columnWidth, 'center', sourceScene.lineBox.padX)
    const right = model.anchor.x + typography.columnWidth
    const rows = Math.max(1, model.lines.length || text.split('\n').length)
    const top = model.anchor.y + (model.extent?.top ?? 0)
    const bottom = model.anchor.y + (model.extent?.bottom ?? rows * typography.lineHeight)
    return {
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    }
  }, [model.anchor, model.extent, model.lines.length, sourceScene.lineBox.padX, text, typography])

  const grid = useMemo(
    () => repeatGrid(frame, node, trophy),
    [frame, node, trophy],
  )
  const artwork = useMemo<RepeatArtwork>(
    () => ({
      frame,
      node,
      trophy,
      image: null,
      sourceWidth: source.width,
      sourceHeight: source.height,
      baselines: model.baselines.map((baseline) => model.anchor.y + baseline),
      lines: model.lines.map((line) => line.text.trimEnd()),
      textColor: sourceScene.canvasColors.text,
      fontWeight: sourceSettings.fontWeight,
      revision: `${threeVersion}:${modifiers}`,
    }),
    // threeVersion makes a newly mounted scene (and its first render) redraw.
    [
      frame,
      node,
      trophy,
      source,
      model.anchor,
      model.baselines,
      model.lines,
      sourceScene,
      sourceSettings,
      modifiers,
      threeVersion,
    ],
  )

  const pixelRatio = Math.min(
    3,
    Math.max(0.5, Math.round((window.devicePixelRatio || 1) * renderZoom * 4) / 4),
  )
  const latest = useRef<RepeatArtwork>(artwork)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Snapshot now: child layout effects have already updated the shared trophy render.
    const live = { ...artwork, image: threeRef.current?.snapshot(1) ?? null }
    latest.current = live
    canvas.width = Math.max(1, Math.round(frame.width * pixelRatio))
    canvas.height = Math.max(1, Math.round(frame.height * pixelRatio))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    drawRepeatArtwork(ctx, live)
  }, [artwork, frame.width, frame.height, pixelRatio])

  useEffect(() => {
    latest.current = artwork
  }, [artwork])
  useEffect(() => {
    onExporter(id, (options: ImageExportOptions) =>
      renderRepeatArtwork(
        { ...latest.current, image: threeRef.current?.snapshot(1) ?? latest.current.image },
        options,
      ),
    )
    return () => onExporter(id, null)
  }, [id, onExporter])

  const updateOffset = (event: ReactPointerEvent) => {
    const gesture = endless.current
    if (!gesture || gesture.pointer !== event.pointerId) return
    event.stopPropagation()
    const zoom = getZoom()
    if (!(zoom > 0)) return
    onLayoutChange(id, {
      offsetX: gesture.offsetX + (event.clientX - gesture.x) / zoom,
      offsetY: gesture.offsetY + (event.clientY - gesture.y) / zoom,
    })
  }
  const endOffset = (event: ReactPointerEvent) => {
    if (endless.current?.pointer === event.pointerId) {
      event.stopPropagation()
      endless.current = null
    }
  }
  const offsetEvents = {
    onPointerMove: updateOffset,
    onPointerUp: endOffset,
    onPointerCancel: endOffset,
    onLostPointerCapture: endOffset,
  }

  return (
    <div
      className="canvas-scene repeat-artboard"
      aria-label={node.name}
      data-repeat-node
      data-scene-id={id}
      data-no-pan
      data-selected={selected || undefined}
      data-repeat-text={text}
      data-pitch-x={grid.pitchX}
      data-pitch-y={grid.pitchY}
      data-offset-x={layout.offsetX}
      data-offset-y={layout.offsetY}
      data-scale={layout.scale}
      data-font-size={typography.fontSize}
      data-frame-width={frame.width}
      data-frame-height={frame.height}
      data-background={node.background}
      data-material-palette={material.palette}
      data-material-shading={material.shading}
      data-twists={modifiers.twists.length}
      data-etches={modifiers.etches.length}
      data-textures={modifiers.textures.length}
      data-patterns={modifiers.patterns.length}
      data-shape={modifiers.shape ? 'linked' : undefined}
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
        } as CSSProperties
      }
      {...drag}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        if ((event.target as Element).closest('[data-repeat-artwork]')) return
        if (event.metaKey) return
        onSelect(id, event.shiftKey, true)
        if (!event.shiftKey) drag.onPointerDown(event)
      }}
    >
      <div className="canvas-scene-name">{node.name}</div>
      <div
        className="repeat-artboard-frame"
        data-repeat-artwork
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: node.background,
          cursor: selected ? 'grab' : 'move',
          touchAction: 'none',
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          onSelect(id, event.shiftKey, true)
          if (event.shiftKey) {
            event.stopPropagation()
            return
          }
          event.preventDefault()
          event.stopPropagation()
          endless.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            offsetX: layout.offsetX,
            offsetY: layout.offsetY,
          }
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            /* synthetic pointer */
          }
        }}
        {...offsetEvents}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
      {/* One offscreen scene render supplies every trophy copy (never one context per copy). */}
      <div
        className="repeat-artboard-source"
        aria-hidden="true"
        style={
          {
            '--artboard-width': `${source.width}px`,
            '--artboard-height': `${source.height}px`,
            '--artboard-scale': 1,
          } as CSSProperties
        }
      >
        <SceneArtboard
          editorRef={editorRef}
          artboardRef={artboardRef}
          model={model}
          settings={sourceSettings}
          scene={sourceScene}
          bannerText={DEFAULT_BANNER_TEXT}
          revolve
          animateRevolve={false}
          perspective={false}
          debug={false}
          pixelRatio={1}
          twists={modifiers.twists}
          etches={modifiers.etches}
          textures={modifiers.textures}
          patterns={modifiers.patterns}
          onTextChange={() => {}}
          canvasMode
          textEditable={false}
          onThreeScene={setThree}
        />
      </div>
      <span
        className="node-port node-port-in"
        data-port="in"
        data-scene-id={id}
        data-connected={modifiers.linked || undefined}
        aria-label={`${node.name} input`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          if (event.shiftKey) onSelect(id, true)
          else onInputDown(id, event)
        }}
      />
      {selected &&
        FRAME_EDGES.map((edge) => (
          <span
            key={edge}
            className="frame-handle"
            data-edge={edge}
            data-handle
            role="slider"
            aria-label={`resize ${edge}`}
            aria-valuenow={edge === 'left' || edge === 'right' ? frame.width : frame.height}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              event.preventDefault()
              try {
                event.currentTarget.setPointerCapture?.(event.pointerId)
              } catch {
                /* synthetic pointer */
              }
              const start = {
                pointer: event.pointerId,
                edge: edge as FrameEdge,
                x: event.clientX,
                y: event.clientY,
                frame: { x: node.x, y: node.y, width: frame.width, height: frame.height },
              }
              endless.current = null
              const move = (next: PointerEvent) => {
                if (start.pointer !== next.pointerId) return
                const zoom = getZoom()
                if (!(zoom > 0)) return
                onResize(
                  id,
                  resizeFrame(
                    start.frame,
                    start.edge,
                    (next.clientX - start.x) / zoom,
                    (next.clientY - start.y) / zoom,
                    next.shiftKey,
                  ),
                )
              }
              const up = (next: PointerEvent) => {
                if (next.pointerId !== start.pointer) return
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
                window.removeEventListener('pointercancel', up)
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
              window.addEventListener('pointercancel', up)
            }}
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
    </div>
  )
})

