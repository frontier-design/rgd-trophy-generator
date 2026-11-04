import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { downloadBlob, maxImageScale } from '../../export'
import { useAutosave, useInfiniteCanvas, usePatternMaps, useSettled } from '../../hooks'
import type { HeightMap } from '../../render3d'
import { ARTBOARD } from '../../state'
import { ControlPanel } from '../ControlPanel'
import { loadCanvasDocument, storeCanvasDocument, type CanvasDocument } from './canvasDocument'
import { CanvasScene, type SceneExporter } from './CanvasScene'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import {
  CARD_COMPACT_SCALE,
  cardScale,
  connect,
  createModifier,
  inputPort,
  linkPath,
  outputPort,
  modifiersByScene,
  type NodeLink,
  type ModifierKind,
  type ModifierNode,
  type SceneModifiers,
} from './graph'
import {
  createSceneNode,
  FRAME_PRESETS,
  fitSceneToFrame,
  type FrameRect,
  measureDefaultText,
  type ImageExportOptions,
  sceneParams,
  withParams,
  type SceneNode,
} from './sceneNode'
import { NodeCard, type ParamsPatch } from './NodeCard'

/** Grid spacing at 100% (px): fine lines, and a heavier line every MAJOR of them. */
const GRID = 24
const MAJOR = 5
/** Below this on-screen spacing (px), the fine lines are dropped (too dense to read). */
const MIN_FINE_SPACING = 6
/** The selected scene's controls: their width, their gap to the scene, how close they come
 *  to the window's edges, and the least height they keep on screen (px). */
const CONTROLS = { width: 340, gap: 16, inset: 12, minHeight: 240 }
/** Where a right-click keeps the browser's own menu (copy, paste…). */
const NATIVE_MENU = 'textarea, input, select'
/** Room kept for the right-click menu, so it opens inside the window (px). */
const MENU_SIZE = { width: 180, height: 190 }
/** Shared by scenes with nothing linked, so they don't re-render for nothing. */
const NO_MODIFIERS: SceneModifiers = { twists: [], etches: [], patterns: [], linked: false }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** What a right-click was on. */
type MenuTarget = { kind: 'scene' | ModifierKind; id: string } | null

interface CanvasPageProps {
  /** The page dropdown, floating at the canvas's top left. */
  tools: ReactNode
}

/**
 * The canvas page: an endless gridded canvas filling the window (no sidebar), to drag and
 * scroll around (hooks/useInfiniteCanvas), with the page dropdown floating at its top left.
 * A node editor: right-click → insert scene places a generator scene (trophy, text) at the
 * click; insert twist / insert etch place modifier nodes (fields on them) whose output
 * ports link, by dragging, to scenes' input ports: twists flute their trophies, etches
 * engrave a strip of lines on them. Press a node to select it (a
 * scene's controls appear beside it), drag it to move it; a scene's text edits in place.
 * Dragging from a linked input picks its last link up (drop it elsewhere or on nothing).
 * Delete/Backspace or right-click → delete removes the selected node and its links. The
 * grid is a CSS background following the view; the world layer, moved and scaled with the
 * view, holds the nodes and their links.
 */
export function CanvasPage({ tools }: CanvasPageProps) {
  // Picks up where it was left: the autosaved canvas (or an opened project).
  const [saved] = useState(loadCanvasDocument)
  const canvasRef = useRef<HTMLElement>(null)
  const { view, size, reset } = useInfiniteCanvas(canvasRef, saved.view)
  const [scenes, setScenes] = useState<SceneNode[]>(saved.scenes)
  const [modifiers, setModifiers] = useState<ModifierNode[]>(saved.modifiers)
  const [links, setLinks] = useState<NodeLink[]>(saved.links)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** The right-click menu: where it was opened (canvas element px) and on what. */
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null)
  /** Nodes inserted so far of each kind, for their names and ids. */
  const [inserted, setInserted] = useState(saved.inserted)
  /** A link being dragged from a node's output, its loose end at the pointer (canvas px). */
  const [pending, setPending] = useState<{ from: string; x: number; y: number } | null>(null)

  // Autosaved shortly after every change (and when leaving the page or closing the tab).
  const autosaved = useMemo<CanvasDocument>(
    () => ({ version: 1, scenes, modifiers, links, inserted, view }),
    [scenes, modifiers, links, inserted, view],
  )
  useAutosave('canvas', autosaved, { serialize: storeCanvasDocument })

  // The view and links, for pointer handlers (canvas px from window px; picking links up).
  const viewRef = useRef(view)
  const linksRef = useRef(links)
  useEffect(() => {
    viewRef.current = view
    linksRef.current = links
  })
  const getZoom = useCallback(() => viewRef.current.zoom, [])
  // Each mounted scene's image exporter (for its controls' export button).
  const exporters = useRef(new Map<string, SceneExporter>())
  const setExporter = useCallback((id: string, exporter: SceneExporter | null) => {
    if (exporter) exporters.current.set(id, exporter)
    else exporters.current.delete(id)
  }, [])
  const getExporter = useCallback((id: string) => exporters.current.get(id), [])
  // Scenes render their 3D view at the zoom once it settles (see CanvasScene).
  const renderZoom = useSettled(view.zoom, 200)
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const { x, y, zoom } = viewRef.current
    return {
      x: (clientX - (rect?.left ?? 0) - x) / zoom,
      y: (clientY - (rect?.top ?? 0) - y) / zoom,
    }
  }, [])

  const updateScene = useCallback(
    (id: string, update: (node: SceneNode) => SceneNode) =>
      setScenes((current) => current.map((node) => (node.id === id ? update(node) : node))),
    [],
  )
  const moveScene = useCallback(
    (id: string, x: number, y: number) => updateScene(id, (node) => ({ ...node, x, y })),
    [updateScene],
  )
  // A resize handle's drag: the new frame (the text and trophy fitted to it, live).
  const resizeScene = useCallback(
    (id: string, { x, y, width, height }: FrameRect) =>
      updateScene(id, (node) =>
        node.frame.width === width && node.frame.height === height && node.x === x && node.y === y
          ? node
          : { ...fitSceneToFrame(node, { width, height }), x, y },
      ),
    [updateScene],
  )
  const setSceneText = useCallback(
    (id: string, text: string) =>
      updateScene(id, (node) => ({ ...node, settings: { ...node.settings, text } })),
    [updateScene],
  )
  const updateModifier = useCallback(
    (id: string, update: (node: ModifierNode) => ModifierNode) =>
      setModifiers((current) => current.map((node) => (node.id === id ? update(node) : node))),
    [],
  )
  const moveModifier = useCallback(
    (id: string, x: number, y: number) => updateModifier(id, (node) => ({ ...node, x, y })),
    [updateModifier],
  )
  const setModifierCollapsed = useCallback(
    (id: string, collapsed: boolean) => updateModifier(id, (node) => ({ ...node, collapsed })),
    [updateModifier],
  )
  const setModifierParams = useCallback(
    (id: string, patch: ParamsPatch) =>
      updateModifier(
        id,
        (node) => ({ ...node, params: { ...node.params, ...patch } }) as ModifierNode,
      ),
    [updateModifier],
  )
  /** Remove a node (scene or modifier) and its links. */
  const deleteNode = useCallback((id: string) => {
    setScenes((current) => current.filter((node) => node.id !== id))
    setModifiers((current) => current.filter((node) => node.id !== id))
    setLinks((current) => current.filter((link) => link.from !== id && link.to !== id))
    setSelectedId((current) => (current === id ? null : current))
  }, [])
  const closeMenu = useCallback(() => setMenu(null), [])

  // Dragging a link: a node's output starts one; a linked input picks its last one up.
  const startLink = useCallback(
    (from: string, e: ReactPointerEvent) => setPending({ from, ...toCanvas(e.clientX, e.clientY) }),
    [toCanvas],
  )
  const pickUpLink = useCallback(
    (sceneId: string, e: ReactPointerEvent) => {
      setSelectedId(sceneId)
      const last = linksRef.current.findLast((link) => link.to === sceneId)
      if (!last) return
      setLinks((current) =>
        current.filter((link) => !(link.from === last.from && link.to === last.to)),
      )
      setPending({ from: last.from, ...toCanvas(e.clientX, e.clientY) })
    },
    [toCanvas],
  )
  const pendingFrom = pending?.from
  useEffect(() => {
    if (!pendingFrom) return
    const onMove = (e: PointerEvent) =>
      setPending((current) => current && { ...current, ...toCanvas(e.clientX, e.clientY) })
    // Dropped on a scene's input: linked. Anywhere else: dropped.
    const onUp = (e: PointerEvent) => {
      const under = document.elementFromPoint?.(e.clientX, e.clientY) ?? e.target
      const port = under instanceof Element ? under.closest<HTMLElement>('[data-port="in"]') : null
      const to = port?.dataset.sceneId
      if (to) setLinks((current) => connect(current, pendingFrom, to))
      setPending(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [pendingFrom, toCanvas])

  /** A new scene centered on a point of the canvas element (px), selected. Its layout is
   *  fitted to the frame, from its text measured once the font has loaded. */
  const insertScene = async (x: number, y: number) => {
    const count = inserted.scene + 1
    setInserted((current) => ({ ...current, scene: count }))
    const centerX = (x - view.x) / view.zoom
    const centerY = (y - view.y) / view.zoom
    const measure = await measureDefaultText()
    const id = `scene-${count}`
    const node = createSceneNode(
      id,
      `scene ${count}`,
      centerX - ARTBOARD.width / 2,
      centerY - ARTBOARD.height / 2,
      measure,
    )
    setScenes((current) => [...current, node])
    setSelectedId(id)
  }

  /** A new modifier node, its top-left at a point of the canvas element (px), selected. */
  const insertModifier = (kind: ModifierKind, x: number, y: number) => {
    const count = inserted[kind] + 1
    setInserted((current) => ({ ...current, [kind]: count }))
    const id = `${kind}-${count}`
    const node = createModifier(
      kind,
      id,
      `${kind} ${count}`,
      (x - view.x) / view.zoom,
      (y - view.y) / view.zoom,
    )
    setModifiers((current) => [...current, node])
    setSelectedId(id)
  }

  // Delete/Backspace removes the selected node (unless typing); Escape deselects.
  useEffect(() => {
    if (!selectedId) return
    const onKeyDown = (e: KeyboardEvent) => {
      const { target } = e
      if (target instanceof Element && target.closest('textarea, input, select, [contenteditable]'))
        return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteNode(selectedId)
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, deleteNode])

  // Pattern nodes' height maps, built in the background.
  const patternNodes = useMemo(
    () => modifiers.filter((node) => node.kind === 'pattern'),
    [modifiers],
  )
  const patternStatuses = usePatternMaps(patternNodes)
  const patternMaps = useMemo(() => {
    const maps = new Map<string, HeightMap>()
    for (const [id, status] of patternStatuses) if (status.map) maps.set(id, status.map)
    return maps
  }, [patternStatuses])
  // Each scene's modifiers, as arrays that only change when its nodes do.
  const sceneModifiers = useMemo(
    () => modifiersByScene(links, modifiers, patternMaps),
    [links, modifiers, patternMaps],
  )
  const linkedNodes = useMemo(() => new Set(links.map((link) => link.from)), [links])

  // Zoomed out far, node cards show only their headers (they're small, and it's less to draw).
  const compactCards = cardScale(view.zoom) < CARD_COMPACT_SCALE
  const fine = GRID * view.zoom
  const grid = {
    '--grid-x': `${view.x}px`,
    '--grid-y': `${view.y}px`,
    '--grid-fine': `${fine}px`,
    '--grid-major': `${fine * MAJOR}px`,
    '--grid-fine-color': fine < MIN_FINE_SPACING ? 'transparent' : undefined,
  } as CSSProperties

  // The selected scene's controls sit just right of it, top-aligned, kept on screen.
  const selected = scenes.find((node) => node.id === selectedId)
  let controlsStyle: CSSProperties | undefined
  if (selected) {
    const { width, gap, inset, minHeight } = CONTROLS
    const left = clamp(
      view.x + (selected.x + selected.frame.width) * view.zoom + gap,
      inset,
      Math.max(inset, size.width - width - inset),
    )
    const top = clamp(
      view.y + selected.y * view.zoom,
      inset,
      Math.max(inset, size.height - minHeight - inset),
    )
    controlsStyle = { left, top, width, maxHeight: Math.max(0, size.height - top - inset) }
  }

  // The links' curves, from each node's output to each scene's input.
  const scenesById = new Map(scenes.map((node) => [node.id, node]))
  const nodesById = new Map(modifiers.map((node) => [node.id, node]))
  const linkPaths = links.flatMap((link) => {
    const from = nodesById.get(link.from)
    const to = scenesById.get(link.to)
    if (!from || !to) return []
    const key = `${link.from}→${link.to}`
    return [{ key, d: linkPath(outputPort(from, view.zoom), inputPort(to), view.zoom) }]
  })
  const pendingSource = pending ? nodesById.get(pending.from) : undefined
  const pendingPath =
    pending && pendingSource
      ? linkPath(outputPort(pendingSource, view.zoom), pending, view.zoom)
      : null

  const menuItems: ContextMenuItem[] = []
  if (menu) {
    const { x, y, target } = menu
    menuItems.push({ label: 'insert scene', onSelect: () => void insertScene(x, y) })
    menuItems.push({ label: 'insert twist', onSelect: () => insertModifier('twist', x, y) })
    menuItems.push({ label: 'insert etch', onSelect: () => insertModifier('etch', x, y) })
    menuItems.push({ label: 'insert pattern', onSelect: () => insertModifier('pattern', x, y) })
    if (target?.kind === 'scene' && links.some((link) => link.to === target.id)) {
      menuItems.push({
        label: 'disconnect inputs',
        onSelect: () => setLinks((current) => current.filter((link) => link.to !== target.id)),
      })
    }
    if (target) {
      menuItems.push({ label: `delete ${target.kind}`, onSelect: () => deleteNode(target.id) })
    }
  }

  return (
    <main className="canvas-page">
      <section
        ref={canvasRef}
        className="infinite-canvas"
        aria-label="Canvas"
        style={grid}
        data-linking={pending ? 'on' : undefined}
        onPointerDown={(e) => {
          // A press on the empty canvas deselects.
          const target = e.target as Element
          if (
            !target.closest(
              '[data-scene-node], [data-canvas-node], [data-scene-controls], .context-menu',
            )
          ) {
            setSelectedId(null)
          }
        }}
        onContextMenu={(e) => {
          const target = e.target as Element
          if (target.closest(NATIVE_MENU) || target.closest('[data-scene-controls]')) return
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          const sceneId = target.closest<HTMLElement>('[data-scene-node]')?.dataset.sceneId
          const nodeElement = target.closest<HTMLElement>('[data-canvas-node]')
          const nodeId = nodeElement?.dataset.nodeId
          const nodeKind = nodeElement?.dataset.kind as ModifierKind | undefined
          const menuTarget: MenuTarget = sceneId
            ? { kind: 'scene', id: sceneId }
            : nodeId && nodeKind
              ? { kind: nodeKind, id: nodeId }
              : null
          if (menuTarget) setSelectedId(menuTarget.id)
          setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, target: menuTarget })
        }}
      >
        <div
          className="infinite-canvas-world"
          style={
            {
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              '--zoom': view.zoom,
              '--card-scale': cardScale(view.zoom),
            } as CSSProperties
          }
        >
          {scenes.map((node) => (
            <CanvasScene
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              getZoom={getZoom}
              renderZoom={renderZoom}
              modifiers={sceneModifiers.get(node.id) ?? NO_MODIFIERS}
              onSelect={setSelectedId}
              onInputDown={pickUpLink}
              onMove={moveScene}
              onTextChange={setSceneText}
              onExporter={setExporter}
              onResize={resizeScene}
            />
          ))}
          <svg className="node-links" aria-hidden="true">
            {linkPaths.map(({ key, d }) => (
              <path key={key} d={d} />
            ))}
            {pendingPath && <path d={pendingPath} data-pending />}
          </svg>
          {modifiers.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              getZoom={getZoom}
              connected={linkedNodes.has(node.id)}
              pattern={patternStatuses.get(node.id)}
              compact={compactCards}
              onCollapsedChange={setModifierCollapsed}
              onSelect={setSelectedId}
              onMove={moveModifier}
              onParamsChange={setModifierParams}
              onOutputDown={startLink}
            />
          ))}
        </div>
        {scenes.length === 0 && modifiers.length === 0 && (
          <p className="canvas-hint">Right-click to insert a scene</p>
        )}
        {selected && (
          <div
            className="scene-controls"
            data-scene-controls
            data-no-pan
            data-own-wheel
            style={controlsStyle}
          >
            <SceneControls
              key={selected.id}
              node={selected}
              onChange={updateScene}
              exporter={getExporter}
            />
          </div>
        )}
        {menu && (
          <ContextMenu
            x={clamp(menu.x, 0, Math.max(0, size.width - MENU_SIZE.width))}
            y={clamp(menu.y, 0, Math.max(0, size.height - MENU_SIZE.height))}
            items={menuItems}
            onClose={closeMenu}
          />
        )}
        <div className="canvas-page-tools" data-no-pan>
          {tools}
        </div>
        <div className="view-tools" data-no-pan>
          <output className="view-zoom" aria-label="Zoom">
            {Math.round(view.zoom * 100)}%
          </output>
          <button type="button" className="control-button" onClick={reset}>
            reset
          </button>
        </div>
      </section>
    </main>
  )
}

interface SceneControlsProps {
  node: SceneNode
  onChange: (id: string, update: (node: SceneNode) => SceneNode) => void
  /** The scene's image exporter, if it's mounted. */
  exporter: (id: string) => SceneExporter | undefined
}

/** The selected scene's control panel. Memoized: the page re-renders on every pan frame
 *  (only the panel's position changes), and the panel is the page's largest part. */
const SceneControls = memo(function SceneControls({
  node,
  onChange,
  exporter,
}: SceneControlsProps) {
  const update = (patch: (node: SceneNode) => SceneNode) => onChange(node.id, patch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { imageExport: options, frame } = node
  const maxScale = maxImageScale(frame.width, frame.height)
  const scale = Math.min(options.scale, maxScale)
  const setOptions = (patch: Partial<ImageExportOptions>) =>
    update((current) => ({ ...current, imageExport: { ...current.imageExport, ...patch } }))

  const exportImage = async () => {
    const run = exporter(node.id)
    if (!run) return
    setBusy(true)
    setError(null)
    try {
      const blob = await run({ ...options, scale })
      const name = node.name.replace(/\s+/g, '-')
      const ext = options.format === 'png' ? 'png' : 'jpg'
      downloadBlob(blob, `rgd-${name}-${frame.width * scale}x${frame.height * scale}.${ext}`)
    } catch (e) {
      setError(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ControlPanel
      tools={<span className="scene-controls-name">{node.name}</span>}
      params={sceneParams(node)}
      onParamsChange={(patch) => update((current) => withParams(current, patch))}
      revealControls={false}
      frame={{
        width: frame.width,
        height: frame.height,
        presets: FRAME_PRESETS,
        // A new size fits the text and trophy to it.
        onSizeChange: (width, height) =>
          update((current) => fitSceneToFrame(current, { width, height })),
        onFit: () => update((current) => fitSceneToFrame(current)),
      }}
      imageExport={{
        format: options.format,
        onFormatChange: (format) => setOptions({ format }),
        scale,
        onScaleChange: (next) => setOptions({ scale: next }),
        maxScale,
        transparent: options.transparent,
        onTransparentChange: (transparent) => setOptions({ transparent }),
        size: `${frame.width * scale} × ${frame.height * scale}`,
        busy,
        error,
        onExport: () => void exportImage(),
      }}
      debug={node.debug}
      onDebugChange={(debug) => update((current) => ({ ...current, debug }))}
      revolve={node.revolve}
      onRevolveChange={(revolve) =>
        update((current) => ({ ...current, revolve, animateRevolve: true }))
      }
      perspective={node.perspective}
      onPerspectiveChange={(perspective) => update((current) => ({ ...current, perspective }))}
    />
  )
})
