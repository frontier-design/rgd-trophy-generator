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
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { downloadBlob, maxImageScale } from '../../export'
import { useAutosave, useInfiniteCanvas, usePatternMaps, useSettled, useUndo } from '../../hooks'
import type { HeightMap } from '../../render3d'
import { ARTBOARD, isImageAssetRef, setSaveError } from '../../state'
import { ControlPanel, type HideableField } from '../ControlPanel'
import {
  hydrateCanvasDocument,
  loadCanvasDocument,
  storeCanvasDocument,
  type CanvasDocument,
} from './canvasDocument'
import { CanvasScene, type SceneExporter, type SceneFrameSource } from './CanvasScene'
import { CanvasComposition } from './CanvasComposition'
import { CanvasRecord, type RecordTyping } from './CanvasRecord'
import {
  createRecordNode,
  recordFrame,
  recordPreviewFrame,
  type PlacedRecordNode,
  type RecordNode,
} from './recordNode'
import { RepeatArtboard } from './RepeatArtboard'
import { RepeatControls } from './RepeatControls'
import { ClusterFrame } from './ClusterFrame'
import {
  clusterBounds,
  clusterPort,
  expandClusterLinks,
  groupSelected,
  copiedGroups,
  toggleMemberMute,
  pasteGroups,
  pruneClusters,
  type ClusterNode,
  type Rect,
} from './cluster'
import { fitImageToRatio, type CompositionImageRect, type CompositionNode } from './compositionNode'
import { useSceneImages } from './useSceneImages'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import {
  CARD_COMPACT_SCALE,
  cardScale,
  connect,
  createModifier,
  inputPort,
  linkPath,
  NODE_CARD,
  outputPort,
  rayTarget,
  createSceneModifiersResolver,
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
import { createRepeatNode, type RepeatNode } from './repeatNode'
import { MASTER_ID, withMaster, type MasterNode, type MasterParams } from './master'
import { NodeCard, type ParamsPatch } from './NodeCard'
import { useTypingPlayback } from './useTypingPlayback'
import { linesFromText } from './textLines'
import {
  createNodePositionStore,
  NodeDragContext,
  useNodePosition,
  type NodePosition,
} from './nodeDrag'
import {
  clearSelection,
  copySelection,
  pasteSelection,
  pickSelection,
  pruneSelection,
  replaceSelection,
  type Selection,
  type CopiedSubgraph,
} from './selection'
import { SelectionMarquee } from './SelectionMarquee'

/** Grid spacing at 100% (px). */
const GRID = 24
/** Keep dots readable when zoomed out by showing progressively coarser grid points. */
const MIN_GRID_SPACING = 12
/** The selected scene's controls: their width, their gap to the scene, how close they come
 *  to the window's edges, and the least height they keep on screen (px). */
const CONTROLS = { width: 340, gap: 16, inset: 12, minHeight: 240 }
/** Where a right-click keeps the browser's own menu (copy, paste…). */
const NATIVE_MENU = 'textarea, input, select'
/** Room kept for the right-click menu, so it opens inside the window (px). */
const MENU_SIZE = { width: 200, height: 300 }
/** Shared by scenes with nothing linked, so they don't re-render for nothing. */
const NO_MODIFIERS: SceneModifiers = {
  twists: [],
  etches: [],
  textures: [],
  patterns: [],
  linked: false,
}

/** The scene panel leaves out what the master node sets for every scene. */
const MASTER_FIELDS: ReadonlySet<HideableField> = new Set<HideableField>([
  'align',
  'mirror',
  'overshoot',
  'roundTop',
  'taper',
  'smoothJoins',
  'shading',
  'banding',
  'gradientScale',
  'tilt',
  'wobble',
  'edgeHue',
  'ledge',
  'grain',
  'grainSize',
  'background',
  'view',
])

/** With a lighting node linked, the panel leaves out its lighting section too. */
const MASTER_AND_LIGHTING_FIELDS: ReadonlySet<HideableField> = new Set<HideableField>([
  ...MASTER_FIELDS,
  'lighting',
])

/** Inputs that take typing (they keep their own clipboard, undo and Backspace). */
const TEXT_INPUT =
  'input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="email"], input[type="url"], input[type="password"]'

/**
 * Whether a key event belongs to a field being typed in. Sliders, switches, color pickers and
 * buttons don't count: pressing a node keeps focus on the last control used (the press is
 * preventDefault'ed), and the canvas's shortcuts must still work then.
 */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      `textarea, select, [contenteditable]:not([contenteditable="false"]), ${TEXT_INPUT}`,
    ) !== null
  )
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** What a right-click was on. */
type MenuTarget = {
  kind: 'scene' | 'composition' | 'record' | 'repeat' | 'cluster' | ModifierKind
  id: string
} | null

/** What was copied (⌘C, or the right-click menu): kept for the session, so it pastes into
 *  this canvas again after switching pages. */
let copied: CopiedSubgraph | null = null

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
  const [compositions, setCompositions] = useState<CompositionNode[]>(saved.compositions)
  const [repeats, setRepeats] = useState<RepeatNode[]>(saved.repeats)
  const [records, setRecords] = useState<RecordNode[]>(saved.records)
  const [modifiers, setModifiers] = useState<ModifierNode[]>(saved.modifiers)
  const typing = useTypingPlayback(modifiers)
  const [links, setLinks] = useState<NodeLink[]>(saved.links)
  const [master, setMaster] = useState<MasterNode>(saved.master)
  const [clusters, setClusters] = useState<ClusterNode[]>(saved.clusters)
  const clustersRef = useRef(clusters)
  useEffect(() => {
    clustersRef.current = clusters
  })
  // The master's settings, for updates made in callbacks (every scene keeps them).
  const masterRef = useRef(master.params)
  useEffect(() => {
    masterRef.current = master.params
  })
  const [selection, updateSelection] = useState<Selection>(clearSelection)
  // Selected edges (link keys, `linkKey`): view-only like the selection, and never alongside
  // selected nodes. Selecting either clears the other; the marquee selects nodes only.
  const [selectedEdges, updateSelectedEdges] = useState<readonly string[]>([])
  const selectedEdgesRef = useRef(selectedEdges)
  const setSelectedEdges = useCallback((next: readonly string[]) => {
    if (!next.length && !selectedEdgesRef.current.length) return
    selectedEdgesRef.current = next
    updateSelectedEdges(next)
  }, [])
  // Drag start needs event-time selection before React commits the pointer-down update.
  const selectionRef = useRef(selection)
  const setSelection = useCallback(
    (next: Selection | ((current: Selection) => Selection)) => {
      const value = typeof next === 'function' ? next(selectionRef.current) : next
      selectionRef.current = value
      updateSelection(value)
      if (value.ids.length) setSelectedEdges([])
    },
    [setSelectedEdges],
  )
  /** Click an edge: it alone; Shift toggles it. Either way, nodes are deselected. */
  const selectEdge = useCallback(
    (key: string, additive = false) => {
      setSelection(clearSelection())
      const current = selectedEdgesRef.current
      setSelectedEdges(
        !additive
          ? [key]
          : current.includes(key)
            ? current.filter((item) => item !== key)
            : [...current, key],
      )
    },
    [setSelection, setSelectedEdges],
  )
  const selectNode = useCallback(
    (id: string, additive = false, preserveGroup = true) => {
      setSelection((current) =>
        !additive && !preserveGroup ? replaceSelection([id]) : pickSelection(current, id, additive),
      )
    },
    [setSelection],
  )
  const selectOnly = useCallback(
    (id: string) => setSelection(replaceSelection([id])),
    [setSelection],
  )
  const clearSelected = useCallback(() => {
    setSelection(clearSelection())
    setSelectedEdges([])
  }, [setSelection, setSelectedEdges])
  const addSelected = useCallback(
    (ids: string[]) => {
      setSelection((current) =>
        replaceSelection([...current.ids, ...ids], ids.at(-1) ?? current.activeId),
      )
    },
    [setSelection],
  )
  const selectedIds = useMemo(() => new Set(selection.ids), [selection.ids])
  /** The right-click menu: where it was opened (canvas element px) and on what. */
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null)
  /** Nodes inserted so far of each kind, for their names and ids. */
  const [inserted, setInserted] = useState(saved.inserted)
  const insertedRef = useRef(inserted)
  const reserveCount = (kind: keyof typeof inserted) => {
    const previous = insertedRef.current[kind]
    const count = (Number.isFinite(previous) ? previous : 0) + 1
    insertedRef.current = { ...insertedRef.current, [kind]: count }
    setInserted(insertedRef.current)
    return count
  }
  // Record nodes take their input scene's frame (and record at its export scale).
  // Record nodes take their input's frame (a scene's or a repeat's) and record at its
  // export scale.
  const recordInputs = useMemo(() => {
    const byId = new Map<string, SceneNode | RepeatNode>(
      [...scenes, ...repeats].map((node) => [node.id, node]),
    )
    return new Map(
      records.flatMap((node) => {
        const link = links.findLast((item) => item.to === node.id && !item.muted)
        const scene = link ? byId.get(link.from) : undefined
        return scene ? [[node.id, scene] as const] : []
      }),
    )
  }, [records, scenes, repeats, links])
  const placedRecords = useMemo(
    () =>
      records.map(
        (node): PlacedRecordNode => {
          const video = recordFrame(recordInputs.get(node.id)?.frame)
          return { ...node, video, frame: recordPreviewFrame(video) }
        },
      ),
    [records, recordInputs],
  )
  /** A link being dragged from a node's output, its loose end at the pointer (canvas px). */
  const [pending, setPending] = useState<{ from: string; x: number; y: number } | null>(null)

  // Autosaved shortly after every change (and when leaving the page or closing the tab).
  const autosaved = useMemo<CanvasDocument>(
    () => ({
      version: 1,
      scenes,
      compositions,
      repeats,
      records,
      modifiers,
      links,
      master,
      clusters,
      inserted,
      view,
    }),
    [scenes, compositions, repeats, records, modifiers, links, master, clusters, inserted, view],
  )
  useAutosave('canvas', autosaved, { serialize: storeCanvasDocument })

  // Images are stored apart from the document (IndexedDB): read the ones this session doesn't
  // already have back asynchronously, and say so if one is missing. Only apply an image the
  // node still shows (a quick upload before hydration wins).
  useEffect(() => {
    let cancelled = false
    const storedImages = saved.modifiers.some(
      (node) => node.kind === 'pattern' && isImageAssetRef(node.params.image),
    )
    const loadedImages = new Map(
      saved.modifiers.flatMap((node) =>
        node.kind === 'pattern' ? ([[node.id, node.params.image]] as const) : [],
      ),
    )
    void hydrateCanvasDocument(saved)
      .then(({ document, missing }) => {
        if (cancelled) return
        const hydrated = new Map(
          document.modifiers.flatMap((node) =>
            node.kind === 'pattern' ? ([[node.id, node.params.image]] as const) : [],
          ),
        )
        // Nothing to replace: a URL source (e.g. the sample) never needs this update.
        if (storedImages) {
          setModifiers((current) => {
            let changed = false
            const next = current.map((node) => {
              if (node.kind !== 'pattern') return node
              const image = hydrated.get(node.id)
              if (
                image === undefined ||
                image === node.params.image ||
                loadedImages.get(node.id) !== node.params.image
              )
                return node
              changed = true
              return { ...node, params: { ...node.params, image } }
            })
            return changed ? next : current
          })
        }
        if (missing.length) {
          setSaveError(
            `Couldn't load ${missing.length === 1 ? 'a saved image asset' : `${missing.length} saved image assets`}: re-upload the image to restore it.`,
          )
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setSaveError(`Couldn't load saved images: ${String(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [saved])

  // Undo / redo (⌘Z, ⇧⌘Z) over the scenes, nodes and links: each change once it settles
  // (a drag or a slider's whole move is one step). Not the view, selection or id counters.
  const content = useMemo(
    () => ({ scenes, compositions, repeats, records, modifiers, links, master, clusters }),
    [scenes, compositions, repeats, records, modifiers, links, master, clusters],
  )
  const history = useUndo(content, (state) => {
    setScenes(state.scenes)
    setCompositions(state.compositions)
    setRepeats(state.repeats)
    setRecords(state.records)
    setModifiers(state.modifiers)
    setLinks(state.links)
    setMaster(state.master)
    setClusters(state.clusters)
    masterRef.current = state.master.params
    setPending(null)
    // Selection is view state: prune missing nodes, never restore it from undo.
    setSelection((current) =>
      pruneSelection(current, [
        MASTER_ID,
        ...state.scenes.map((node) => node.id),
        ...state.compositions.map((node) => node.id),
        ...state.repeats.map((node) => node.id),
        ...state.records.map((node) => node.id),
        ...state.modifiers.map((node) => node.id),
        ...state.clusters.map((node) => node.id),
      ]),
    )
  })

  const { checkpoint } = history
  // A drag's one document update closes its own undo step after useUndo sees the commit.
  const moveCommitted = useRef(false)
  useEffect(() => {
    if (!moveCommitted.current) return
    moveCommitted.current = false
    checkpoint()
  }, [content, checkpoint])

  const positions = useMemo(() => createNodePositionStore(), [])
  const boardNodes = useRef(new Map<string, NodePosition & { id: string }>())
  useEffect(() => {
    boardNodes.current = new Map(
      [...scenes, ...compositions, ...repeats, ...records, ...modifiers, master].map((node) => [
        node.id,
        node,
      ]),
    )
  }, [scenes, compositions, repeats, records, modifiers, master])
  // Clusters' frames (canvas px) and members, for drags (set each render, below).
  const clusterFrames = useRef(new Map<string, { bounds: Rect; members: string[] }>())
  const participants = useCallback((id: string) => {
    const ids = selectionRef.current.ids.includes(id) ? selectionRef.current.ids : [id]
    // A cluster moves its frame (its preview, for the frame and its links) and its members.
    const expanded = ids.flatMap((key) => {
      const cluster = clusterFrames.current.get(key)
      return cluster ? [key, ...cluster.members] : [key]
    })
    return [...new Set(expanded)].flatMap((key) => {
      const cluster = clusterFrames.current.get(key)
      if (cluster) return [{ id: key, x: cluster.bounds.x, y: cluster.bounds.y }]
      const node = boardNodes.current.get(key)
      return node ? [{ id: node.id, x: node.x, y: node.y }] : []
    })
  }, [])
  const commitMoves = useCallback((moves: ReadonlyMap<string, NodePosition>) => {
    moveCommitted.current = true
    setScenes((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setCompositions((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setRepeats((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setRecords((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setModifiers((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setMaster((current) =>
      moves.has(MASTER_ID) ? { ...current, ...moves.get(MASTER_ID)! } : current,
    )
  }, [])
  // Option-drag duplicates (set below, once the clipboard's paste exists).
  type DuplicateMoves = (
    ids: readonly string[],
    offset: NodePosition,
    options?: { ungrouped?: boolean },
  ) => void
  const duplicateMovesRef = useRef<DuplicateMoves>(() => {})
  const duplicateMoves = useCallback<DuplicateMoves>(
    (ids, offset, options) => duplicateMovesRef.current(ids, offset, options),
    [],
  )
  const dragController = useMemo(
    () => ({
      positions,
      checkpoint,
      participants,
      commit: commitMoves,
      duplicate: duplicateMoves,
      onTap: selectOnly,
    }),
    [positions, checkpoint, participants, commitMoves, duplicateMoves, selectOnly],
  )
  useEffect(() => () => positions.dispose(), [positions])

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
  // Each mounted scene's frames, for record nodes.
  const frameSources = useRef(new Map<string, SceneFrameSource>())
  const setFrameSource = useCallback((id: string, source: SceneFrameSource | null) => {
    if (source) frameSources.current.set(id, source)
    else frameSources.current.delete(id)
  }, [])
  const getFrameSource = useCallback((id: string) => frameSources.current.get(id), [])
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

  // Every update keeps the master's settings (e.g. fitting to a frame turns the mirror on).
  const updateScene = useCallback(
    (id: string, update: (node: SceneNode) => SceneNode) =>
      setScenes((current) =>
        current.map((node) =>
          node.id === id ? withMaster(update(node), masterRef.current) : node,
        ),
      ),
    [],
  )
  /** A master node edit: applied to every scene. */
  const setMasterParams = useCallback((patch: Partial<MasterParams>) => {
    const params = { ...masterRef.current, ...patch }
    masterRef.current = params
    setMaster((current) => ({ ...current, params }))
    setScenes((current) => current.map((node) => withMaster(node, params)))
  }, [])
  const moveScene = useCallback(
    (id: string, x: number, y: number) => {
      moveCommitted.current = true
      updateScene(id, (node) => ({ ...node, x, y }))
    },
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
    (id: string, text: string) => {
      const source = [...links]
        .reverse()
        .find(
          (link) =>
            !link.muted &&
            link.to === id &&
            modifiers.some((node) => node.id === link.from && node.kind === 'text'),
        )
      if (source) {
        setModifiers((current) =>
          current.map((node) =>
            // Edited on the artboard: the lines keep their speed and tracking by position.
            node.id === source.from && node.kind === 'text'
              ? { ...node, params: { lines: linesFromText(text, node.params.lines) } }
              : node,
          ),
        )
      } else {
        updateScene(id, (node) => ({ ...node, settings: { ...node.settings, text } }))
      }
    },
    [updateScene, links, modifiers],
  )
  const updateModifier = useCallback(
    (id: string, update: (node: ModifierNode) => ModifierNode) =>
      setModifiers((current) => {
        const next = current.map((node) => (node.id === id ? update(node) : node))
        return next.every((node, index) => node === current[index]) ? current : next
      }),
    [],
  )
  const moveModifier = useCallback(
    (id: string, x: number, y: number) => {
      moveCommitted.current = true
      if (id === MASTER_ID) setMaster((current) => ({ ...current, x, y }))
      else updateModifier(id, (node) => ({ ...node, x, y }))
    },
    [updateModifier],
  )
  const setModifierCollapsed = useCallback(
    (id: string, collapsed: boolean) =>
      id === MASTER_ID
        ? setMaster((current) => ({ ...current, collapsed }))
        : updateModifier(id, (node) => ({ ...node, collapsed })),
    [updateModifier],
  )
  const setModifierParams = useCallback(
    (id: string, patch: ParamsPatch) =>
      id === MASTER_ID
        ? setMasterParams(patch as Partial<MasterParams>)
        : updateModifier(id, (node) =>
            Object.entries(patch as Record<string, unknown>).every(
              ([key, value]) => node.params[key as keyof typeof node.params] === value,
            )
              ? node
              : ({ ...node, params: { ...node.params, ...patch } } as ModifierNode),
          ),
    [updateModifier, setMasterParams],
  )
  /** Remove selected nodes and incident links; the master is movable but never deleted. */
  const deleteNodes = useCallback(
    (ids: readonly string[]) => {
      const removed = new Set(ids.filter((id) => id !== MASTER_ID))
      // A cluster goes with its members.
      for (const id of ids) clusterFrames.current.get(id)?.members.forEach((m) => removed.add(m))
      if (!removed.size) return
      positions.dispose()
      checkpoint()
      moveCommitted.current = true
      setScenes((current) => current.filter((node) => !removed.has(node.id)))
      setCompositions((current) => current.filter((node) => !removed.has(node.id)))
      setRepeats((current) => current.filter((node) => !removed.has(node.id)))
      setRecords((current) => current.filter((node) => !removed.has(node.id)))
      setModifiers((current) => current.filter((node) => !removed.has(node.id)))
      setClusters((current) => {
        const kept = current.filter((cluster) => !removed.has(cluster.id))
        const remaining = new Set(kept.flatMap((cluster) => cluster.members))
        removed.forEach((id) => remaining.delete(id))
        return pruneClusters(kept, remaining)
      })
      setLinks((current) =>
        current.filter((link) => !removed.has(link.from) && !removed.has(link.to)),
      )
      setSelection((current) =>
        replaceSelection(
          current.ids.filter((id) => !removed.has(id)),
          current.activeId,
        ),
      )
    },
    [positions, checkpoint, setSelection],
  )
  /** Remove the selected edges (their links); the nodes stay. */
  const deleteEdges = useCallback(
    (keys: readonly string[]) => {
      const removed = new Set(keys)
      setSelectedEdges([])
      if (!linksRef.current.some((link) => removed.has(linkKey(link)))) return
      checkpoint()
      moveCommitted.current = true
      setLinks((current) => current.filter((link) => !removed.has(linkKey(link))))
    },
    [checkpoint, setSelectedEdges],
  )
  const closeMenu = useCallback(() => setMenu(null), [])

  // Dragging a link: a node's output starts one; a linked input picks its last one up.
  const startLink = useCallback(
    (from: string, e: ReactPointerEvent) => {
      // A grouped node links only through its group.
      if (clustersRef.current.some((cluster) => cluster.members.includes(from))) return
      setPending({ from, ...toCanvas(e.clientX, e.clientY) })
    },
    [toCanvas],
  )
  const pickUpLink = useCallback(
    (sceneId: string, e: ReactPointerEvent) => {
      selectOnly(sceneId)
      const last = linksRef.current.findLast((link) => link.to === sceneId)
      if (!last) return
      setLinks((current) =>
        current.filter((link) => !(link.from === last.from && link.to === last.to)),
      )
      setPending({ from: last.from, ...toCanvas(e.clientX, e.clientY) })
    },
    [toCanvas, selectOnly],
  )
  const pendingFrom = pending?.from
  useEffect(() => {
    if (!pendingFrom) return
    const onMove = (e: PointerEvent) =>
      setPending((current) => current && { ...current, ...toCanvas(e.clientX, e.clientY) })
    // Dropped on an input: linked. Dropped short: linked to the first scene (or, from a
    // scene, composition) the line from the outlet through the drop point goes on to hit.
    // Otherwise dropped.
    const onUp = (e: PointerEvent) => {
      const under = document.elementFromPoint?.(e.clientX, e.clientY) ?? e.target
      const port = under instanceof Element ? under.closest<HTMLElement>('[data-port="in"]') : null
      const sourceIsScene = scenes.some((node) => node.id === pendingFrom)
      // A repeat's output links only to record nodes.
      const sourceIsRepeat = repeats.some((node) => node.id === pendingFrom)
      const clusterFrame = clusterFrames.current.get(pendingFrom)
      const source: LinkSource | undefined =
        scenes.find((node) => node.id === pendingFrom) ??
        repeats.find((node) => node.id === pendingFrom) ??
        modifiers.find((node) => node.id === pendingFrom) ??
        (clusterFrame ? { id: pendingFrom, cluster: true, ...clusterFrame.bounds } : undefined)
      const to =
        port?.dataset.sceneId ??
        (source
          ? (rayTarget(
              sourcePort(source, viewRef.current.zoom),
              toCanvas(e.clientX, e.clientY),
              (sourceIsScene
                ? [...compositions, ...placedRecords]
                : sourceIsRepeat
                  ? placedRecords
                  : [...scenes, ...repeats])
                .filter((node) => node.id !== pendingFrom)
                .map((node) => ({ id: node.id, x: node.x, y: node.y, ...node.frame })),
            ) ?? undefined)
          : undefined)
      const targetIsComposition = compositions.some((node) => node.id === to)
      // A record node takes one input, like a composition.
      const targetIsRecord = records.some((node) => node.id === to)
      const targetIsRepeat = repeats.some((node) => node.id === to)
      const valid =
        to &&
        (sourceIsScene
          ? targetIsComposition || targetIsRecord
          : sourceIsRepeat
            ? targetIsRecord
            : (modifiers.some((node) => node.id === pendingFrom) ||
              clusterFrames.current.has(pendingFrom)) &&
            (scenes.some((node) => node.id === to) || targetIsRepeat))
      if (valid) {
        setLinks((current) =>
          connect(
            targetIsComposition || targetIsRecord
              ? current.filter((link) => link.to !== to)
              : current,
            pendingFrom,
            to,
          ),
        )
        if (targetIsComposition) {
          const source = scenes.find((node) => node.id === pendingFrom)
          if (source)
            setCompositions((current) =>
              current.map((node) => {
                if (node.id !== to) return node
                const scale = Math.min(
                  node.frame.width / source.frame.width,
                  node.frame.height / source.frame.height,
                )
                const width = source.frame.width * scale,
                  height = source.frame.height * scale
                return {
                  ...node,
                  image: {
                    x: (node.frame.width - width) / 2,
                    y: (node.frame.height - height) / 2,
                    width,
                    height,
                  },
                }
              }),
            )
        }
      }
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
  }, [pendingFrom, toCanvas, scenes, compositions, records, placedRecords, repeats, modifiers])

  /** A new scene centered on a point of the canvas element (px), selected. Its layout is
   *  fitted to the frame, from its text measured once the font has loaded. */
  const insertScene = async (x: number, y: number) => {
    const count = reserveCount('scene')
    const centerX = (x - view.x) / view.zoom
    const centerY = (y - view.y) / view.zoom
    const measure = await measureDefaultText()
    const id = `scene-${count}`
    const node = withMaster(
      createSceneNode(
        id,
        `scene ${count}`,
        centerX - ARTBOARD.width / 2,
        centerY - ARTBOARD.height / 2,
        measure,
      ),
      master.params,
    )
    setScenes((current) => [...current, node])
    selectOnly(id)
  }

  const insertComposition = (x: number, y: number) => {
    const count = reserveCount('composition')
    const id = `composition-${count}`
    setCompositions((current) => [
      ...current,
      {
        id,
        name: `composition ${count}`,
        x: (x - view.x) / view.zoom - ARTBOARD.width / 2,
        y: (y - view.y) / view.zoom - ARTBOARD.height / 2,
        frame: { width: ARTBOARD.width, height: ARTBOARD.height },
        image: { x: 0, y: 0, width: ARTBOARD.width, height: ARTBOARD.height },
      },
    ])
    selectOnly(id)
  }
  /** A new record node centered on a point of the canvas element (px), selected. */
  const insertRecord = (x: number, y: number) => {
    const count = reserveCount('record')
    const id = `record-${count}`
    setRecords((current) => [
      ...current,
      createRecordNode(
        id,
        `record ${count}`,
        (x - view.x) / view.zoom - recordPreviewFrame(ARTBOARD).width / 2,
        (y - view.y) / view.zoom - recordPreviewFrame(ARTBOARD).height / 2,
      ),
    ])
    selectOnly(id)
  }
  const moveRecord = useCallback((id: string, x: number, y: number) => {
    setRecords((current) => current.map((node) => (node.id === id ? { ...node, x, y } : node)))
  }, [])
  const updateRecord = useCallback(
    (id: string, patch: Partial<Pick<RecordNode, 'fps' | 'holdIn' | 'holdOut'>>) => {
      setRecords((current) =>
        current.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      )
    },
    [],
  )
  const insertRepeat = (x: number, y: number) => {
    const count = reserveCount('repeat')
    const id = `repeat-${count}`
    setRepeats((current) => [
      ...current,
      createRepeatNode(
        id,
        `repeat ${count}`,
        (x - view.x) / view.zoom - ARTBOARD.width / 2,
        (y - view.y) / view.zoom - ARTBOARD.height / 2,
      ),
    ])
    selectOnly(id)
  }
  const moveRepeat = useCallback((id: string, x: number, y: number) => {
    setRepeats((current) => current.map((node) => (node.id === id ? { ...node, x, y } : node)))
  }, [])
  const resizeRepeat = useCallback((id: string, rect: FrameRect) => {
    setRepeats((current) =>
      current.map((node) =>
        node.id === id
          ? { ...node, x: rect.x, y: rect.y, frame: { width: rect.width, height: rect.height } }
          : node,
      ),
    )
  }, [])
  const updateRepeat = useCallback(
    (id: string, update: (node: RepeatNode) => RepeatNode) =>
      setRepeats((current) => current.map((node) => (node.id === id ? update(node) : node))),
    [],
  )
  const setRepeatLayout = useCallback(
    (id: string, patch: Partial<RepeatNode['layout']>) =>
      updateRepeat(id, (node) => ({ ...node, layout: { ...node.layout, ...patch } })),
    [updateRepeat],
  )
  const moveComposition = useCallback((id: string, x: number, y: number) => {
    setCompositions((current) => current.map((node) => (node.id === id ? { ...node, x, y } : node)))
  }, [])
  const resizeComposition = useCallback((id: string, rect: FrameRect) => {
    setCompositions((current) =>
      current.map((node) =>
        node.id === id
          ? { ...node, x: rect.x, y: rect.y, frame: { width: rect.width, height: rect.height } }
          : node,
      ),
    )
  }, [])
  const setCompositionImage = useCallback((id: string, image: CompositionImageRect) => {
    setCompositions((current) =>
      current.map((node) => (node.id === id ? { ...node, image } : node)),
    )
  }, [])

  /** A new modifier node, its top-left at a point of the canvas element (px), selected. */
  const insertModifier = (kind: ModifierKind, x: number, y: number) => {
    const count = reserveCount(kind)
    const id = `${kind}-${count}`
    const node = createModifier(
      kind,
      id,
      `${kind} ${count}`,
      (x - view.x) / view.zoom,
      (y - view.y) / view.zoom,
    )
    setModifiers((current) => [...current, node])
    selectOnly(id)
  }

  // Clipboard snapshots keep relative positions and only the selected subgraph's links.
  const [hasCopy, setHasCopy] = useState(copied !== null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  /** A copy of the selection; a selected group stands for its nodes. The copied nodes' groups
   *  come along, so their copies stay grouped (`pasteGroups`). */
  const snapshotOf = (selected: Selection): CopiedSubgraph => {
    const ids = selected.ids.flatMap(
      (id) => clusters.find((cluster) => cluster.id === id)?.members ?? [id],
    )
    const snapshot = copySelection(
      replaceSelection(ids, selected.activeId),
      scenes,
      modifiers,
      links,
      compositions,
      repeats,
    )
    const groups = copiedGroups(
      clusters,
      selected.ids,
      new Set(snapshot.modifiers.map((node) => node.id)),
    )
    return { ...snapshot, groups }
  }
  const copyNodes = (selected: Selection = selectionRef.current) => {
    const snapshot = snapshotOf(selected)
    copied = snapshot.ids.length ? snapshot : null
    setHasCopy(copied !== null)
  }
  /** `ungrouped` (Option+⌘-drag): copies of grouped nodes land outside their groups. */
  const pasteCopy = (
    at: NodePosition | null,
    entry: CopiedSubgraph | null = copied,
    offset?: NodePosition,
    { ungrouped = false }: { ungrouped?: boolean } = {},
  ) => {
    if (!entry?.ids.length) return
    positions.dispose()
    checkpoint()
    const nudge = 40 / viewRef.current.zoom
    const pasted = pasteSelection(
      entry,
      insertedRef.current,
      at ? { at } : { offset: offset ?? { x: nudge, y: nudge } },
    )
    insertedRef.current = pasted.inserted
    setInserted(pasted.inserted)
    moveCommitted.current = true
    setScenes((current) => [
      ...current,
      ...pasted.scenes.map((node) => withMaster(node, masterRef.current)),
    ])
    setCompositions((current) => [...current, ...pasted.compositions])
    setRepeats((current) => [...current, ...pasted.repeats])
    setModifiers((current) => [...current, ...pasted.modifiers])
    setLinks((current) => [...current, ...pasted.links])
    if (entry.groups?.length && !ungrouped) {
      const remap = new Map(
        entry.modifiers.flatMap((node, i) => {
          const copy = pasted.modifiers[i]
          return copy ? [[node.id, copy.id] as const] : []
        }),
      )
      setClusters(
        pasteGroups(
          clusters,
          entry.groups,
          remap,
          [...modifiers, ...pasted.modifiers].map((node) => node.id),
          () => {
            const count = reserveCount('cluster')
            return { id: `cluster-${count}`, name: `group ${count}` }
          },
        ),
      )
    }
    setSelection(replaceSelection(pasted.ids, pasted.activeId))
  }
  /** ⌘G: groups the selected modifier nodes (scenes, compositions and the master stay out):
   *  into the first selected group, or a new one (`groupSelected`). The group is selected. */
  const groupSelection = () => {
    const result = groupSelected(
      clusters,
      links,
      selectionRef.current.ids,
      modifiers.map((node) => node.id),
      () => {
        const count = reserveCount('cluster')
        return { id: `cluster-${count}`, name: `group ${count}` }
      },
    )
    if (!result) return
    checkpoint()
    setLinks(result.links)
    setClusters(result.clusters)
    selectOnly(result.id)
  }
  /** ⇧⌘G: selected clusters (and those holding selected nodes) back to separate nodes, their
   *  links carried on by each member. */
  const ungroupSelection = () => {
    const selected = new Set(selectionRef.current.ids)
    const ungrouped = clusters.filter(
      (cluster) => selected.has(cluster.id) || cluster.members.some((id) => selected.has(id)),
    )
    if (!ungrouped.length) return
    checkpoint()
    const gone = new Set(ungrouped.map((cluster) => cluster.id))
    setLinks((current) => expandClusterLinks(current, ungrouped))
    setClusters((current) => current.filter((cluster) => !gone.has(cluster.id)))
    setSelection(replaceSelection(ungrouped.flatMap((cluster) => cluster.members)))
  }
  const duplicateNodes = (selected: Selection = selectionRef.current) => {
    pasteCopy(null, snapshotOf(selected))
  }
  useEffect(() => {
    duplicateMovesRef.current = (ids, offset, options) =>
      pasteCopy(null, snapshotOf(replaceSelection(ids)), offset, options)
  })
  // The keys, with this render's state (re-subscribed each render, as it changes). Not while
  // typing: a text field keeps its own undo and clipboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const { target } = e
      if (isTyping(target)) return
      const key = e.key.toLowerCase()
      // ⌘Z undoes, ⇧⌘Z (or Ctrl+Y) redoes. Stopped here (captured on the window) so no other
      // page's shortcuts see it.
      if (key === 'z' || (key === 'y' && e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        e.stopPropagation()
        positions.dispose()
        if (key === 'z' && !e.shiftKey) history.undo()
        else history.redo()
        return
      }
      // ⌘G clusters the selection, ⇧⌘G takes clusters apart (not the browser's find).
      if (key === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if (e.shiftKey) return
      if (key === 'c' && selectionRef.current.ids.length) {
        e.preventDefault()
        copyNodes()
      } else if (key === 'v' && copied) {
        e.preventDefault()
        pasteCopy(pointer.current)
      } else if (key === 'd' && selectionRef.current.ids.length) {
        e.preventDefault()
        duplicateNodes()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  // Selection remains view state; text fields keep their own editing shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { target } = e
      if (isTyping(target)) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgesRef.current.length) {
          e.preventDefault()
          deleteEdges(selectedEdgesRef.current)
          return
        }
        if (!selectionRef.current.ids.length) return
        e.preventDefault()
        deleteNodes(selectionRef.current.ids)
      } else if (e.key === 'Escape') {
        positions.dispose()
        clearSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteNodes, deleteEdges, positions, clearSelected])

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
  // The links as scenes see them: a cluster's output stands for each of its members.
  const effectiveLinks = useMemo(() => expandClusterLinks(links, clusters), [links, clusters])
  // Each record node's animation: the text node its scene shows (the last linked one wins,
  // as in modifiersByScene).
  const recordTypings = useMemo(() => {
    const out = new Map<string, RecordTyping>()
    for (const [recordId, scene] of recordInputs) {
      const link = effectiveLinks.findLast(
        (item) =>
          !item.muted &&
          item.to === scene.id &&
          modifiers.some((node) => node.id === item.from && node.kind === 'text'),
      )
      const node = link && modifiers.find((item) => item.id === link.from)
      if (node?.kind === 'text') out.set(recordId, { id: node.id, name: node.name, params: node.params })
    }
    return out
  }, [recordInputs, effectiveLinks, modifiers])
  // A record node's timeline seeks the text node; its render, frame by frame, commits at
  // once (`sync`), so the scene is drawn and ready when this returns.
  const seekTypingNode = typing.seek
  const seekTyping = useCallback(
    (id: string, seconds: number | null, sync = false) => {
      if (sync) flushSync(() => seekTypingNode(id, seconds))
      else seekTypingNode(id, seconds)
    },
    [seekTypingNode],
  )
  // Position/name/fold changes don't invalidate artwork, and unrelated scenes keep their inputs.
  const resolveModifiers = useMemo(() => createSceneModifiersResolver(), [])
  const sceneModifiers = useMemo(
    () => resolveModifiers(effectiveLinks, typing.previewNodes, patternMaps),
    [resolveModifiers, effectiveLinks, typing.previewNodes, patternMaps],
  )
  const [visualRevisions, setVisualRevisions] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  )
  const onVisualChange = useCallback((id: string) => {
    setVisualRevisions((current) => new Map(current).set(id, (current.get(id) ?? 0) + 1))
  }, [])
  // Each composition's image laid out at its scene's current shape (fitImageToRatio), so
  // resizing the scene's artboard never stretches it. Unchanged compositions stay the same
  // objects (CanvasComposition is memoized).
  const fittedCompositions = useMemo(() => {
    const frames = new Map(scenes.map((scene) => [scene.id, scene.frame]))
    return compositions.map((node) => {
      const link = links.findLast((item) => item.to === node.id && !item.muted)
      const frame = link ? frames.get(link.from) : undefined
      if (!frame) return node
      const image = fitImageToRatio(node.image, frame.width / frame.height)
      return image === node.image ? node : { ...node, image }
    })
  }, [compositions, scenes, links])
  const sceneImages = useSceneImages(
    scenes,
    effectiveLinks,
    sceneModifiers,
    getExporter,
    visualRevisions,
  )
  const linkedNodes = useMemo(
    () => new Set([...links, ...effectiveLinks].map((link) => link.from)),
    [links, effectiveLinks],
  )
  const groupedNodes = useMemo(
    () => new Set(clusters.flatMap((cluster) => cluster.members)),
    [clusters],
  )
  const mutedNodes = useMemo(() => {
    const muted = new Set(links.filter((link) => link.muted).map((link) => link.from))
    for (const link of links) if (!link.muted) muted.delete(link.from)
    // Grouped nodes are muted within their group.
    for (const cluster of clusters) cluster.muted?.forEach((id) => muted.add(id))
    return muted
  }, [links, clusters])
  const toggleOutgoingMute = useCallback((id: string) => {
    // A grouped node has no links of its own: it's muted within its group.
    if (clustersRef.current.some((cluster) => cluster.members.includes(id))) {
      setClusters((current) => toggleMemberMute(current, id))
      return
    }
    setLinks((current) => {
      const outgoing = current.filter((link) => link.from === id)
      if (!outgoing.length) return current
      const muted = outgoing.some((link) => !link.muted)
      return current.map((link) => (link.from === id ? { ...link, muted } : link))
    })
  }, [])
  // Hit areas exist for all linked range modifiers, independently of selection.
  const rangeModifiersByScene = useMemo(() => {
    const byId = new Map(modifiers.map((node) => [node.id, node]))
    const grouped = new Map<string, ModifierNode[]>()
    for (const link of effectiveLinks) {
      if (link.muted) continue
      const modifier = byId.get(link.from)
      if (
        modifier &&
        modifier.kind !== 'material' &&
        modifier.kind !== 'lighting' &&
        modifier.kind !== 'text'
      )
        grouped.set(link.to, [...(grouped.get(link.to) ?? []), modifier])
    }
    return grouped
  }, [modifiers, effectiveLinks])

  // Zoomed out far, node cards show only their headers (they're small, and it's less to draw).
  const compactCards = cardScale(view.zoom) < CARD_COMPACT_SCALE

  // Clusters' frames, around their members' cards. A card's height comes from the page (its
  // fields, folded or not), measured after each render (only for clustered cards).
  const cardOnCanvas = cardScale(view.zoom) / view.zoom
  const [cardHeights, setCardHeights] = useState<ReadonlyMap<string, number>>(() => new Map())
  const clusteredKey = clusters.flatMap((cluster) => cluster.members).join(' ')
  const modifierKey = modifiers.map((node) => node.id).join(' ')
  useLayoutEffect(() => {
    const ids = clusteredKey ? clusteredKey.split(' ') : []
    if (!ids.length || typeof ResizeObserver === 'undefined') return
    const cards = new Map<Element, string>()
    for (const id of ids) {
      const card = canvasRef.current?.querySelector<HTMLElement>(
        `[data-canvas-node][data-node-id="${CSS.escape(id)}"] .node-card`,
      )
      if (card) cards.set(card, id)
    }
    // Fires once for each card at once, then whenever one folds, compacts or grows.
    const observer = new ResizeObserver((entries) => {
      setCardHeights((current) => {
        let next: Map<string, number> | null = null
        for (const entry of entries) {
          const id = cards.get(entry.target)
          const height = (entry.target as HTMLElement).offsetHeight
          if (!id || current.get(id) === height) continue
          next ??= new Map(current)
          next.set(id, height)
        }
        return next ?? current
      })
    })
    cards.forEach((_, card) => observer.observe(card))
    return () => observer.disconnect()
  }, [clusteredKey, modifierKey])
  const modifiersById = new Map(modifiers.map((node) => [node.id, node]))
  const clusterLayouts = clusters.flatMap((cluster) => {
    const rects = cluster.members.flatMap((id) => {
      const node = modifiersById.get(id)
      if (!node) return []
      return [
        {
          x: node.x,
          y: node.y,
          width: NODE_CARD.width * cardOnCanvas,
          height: (cardHeights.get(id) ?? NODE_CARD.header) * cardOnCanvas,
        },
      ]
    })
    const bounds = clusterBounds(rects, cardOnCanvas)
    return bounds ? [{ cluster, bounds }] : []
  })
  useEffect(() => {
    clusterFrames.current = new Map(
      clusterLayouts.map(({ cluster, bounds }) => [
        cluster.id,
        { bounds, members: cluster.members },
      ]),
    )
  })
  const spacing = GRID * view.zoom
  const fine = spacing * 2 ** Math.max(0, Math.ceil(Math.log2(MIN_GRID_SPACING / spacing)))
  const grid = {
    '--grid-x': `${view.x}px`,
    '--grid-y': `${view.y}px`,
    '--grid-fine': `${fine}px`,
  } as CSSProperties

  // The selected artboard's controls sit just right of it, top-aligned, kept on screen.
  const selectedScene = scenes.find((node) => node.id === selection.activeId)
  const selectedRepeat = repeats.find((node) => node.id === selection.activeId)

  // The links' curves, from each node's output to each scene's input.
  const sourcesById = new Map<string, LinkSource>([
    ...[...modifiers, ...scenes, ...repeats].map((node): [string, LinkSource] => [node.id, node]),
    ...clusterLayouts.map(({ cluster, bounds }): [string, LinkSource] => [
      cluster.id,
      { id: cluster.id, cluster: true, ...bounds },
    ]),
  ])
  const targetsById = new Map<string, LinkTarget>(
    [...scenes, ...compositions, ...repeats, ...placedRecords].map((node) => [node.id, node]),
  )
  const linkPaths = links.flatMap((link) => {
    const from = sourcesById.get(link.from)
    const to = targetsById.get(link.to)
    if (!from || !to) return []
    return [{ key: linkKey(link), from, to, muted: link.muted }]
  })
  const selectedEdgeSet = new Set(selectedEdges)
  const pendingSource = pending ? sourcesById.get(pending.from) : undefined
  const pendingPath =
    pending && pendingSource
      ? linkPath(sourcePort(pendingSource, view.zoom), pending, view.zoom)
      : null

  /** A point of the canvas element (px) in canvas px. */
  const toCanvasAt = (x: number, y: number) => ({
    x: (x - view.x) / view.zoom,
    y: (y - view.y) / view.zoom,
  })
  const subject =
    selection.ids.length > 1
      ? 'selection'
      : menu?.target?.kind === 'cluster'
        ? 'group'
        : menu?.target?.kind
  const disconnectTarget =
    menu?.target?.kind === 'scene' ||
    menu?.target?.kind === 'composition' ||
    menu?.target?.kind === 'record' ||
    menu?.target?.kind === 'repeat'
      ? menu.target.id
      : null
  const menuItems: ContextMenuItem[] = menu
    ? [
        { label: 'insert scene', onSelect: () => void insertScene(menu.x, menu.y) },
        { label: 'insert composition', onSelect: () => insertComposition(menu.x, menu.y) },
        { label: 'insert repeat', onSelect: () => insertRepeat(menu.x, menu.y) },
        { label: 'insert record', onSelect: () => insertRecord(menu.x, menu.y) },
        { label: 'insert text', onSelect: () => insertModifier('text', menu.x, menu.y) },
        { label: 'insert shape', onSelect: () => insertModifier('shape', menu.x, menu.y) },
        { label: 'insert twist', onSelect: () => insertModifier('twist', menu.x, menu.y) },
        { label: 'insert etch', onSelect: () => insertModifier('etch', menu.x, menu.y) },
        { label: 'insert pattern', onSelect: () => insertModifier('pattern', menu.x, menu.y) },
        { label: 'insert material', onSelect: () => insertModifier('material', menu.x, menu.y) },
        { label: 'insert lighting', onSelect: () => insertModifier('lighting', menu.x, menu.y) },
        { label: 'insert texture', onSelect: () => insertModifier('texture', menu.x, menu.y) },
        ...(disconnectTarget && links.some((link) => link.to === disconnectTarget)
          ? [
              {
                label: 'disconnect inputs',
                onSelect: () =>
                  setLinks((current) => current.filter((link) => link.to !== disconnectTarget)),
              },
            ]
          : []),
        ...(hasCopy
          ? [{ label: 'paste', onSelect: () => pasteCopy(toCanvasAt(menu.x, menu.y)) }]
          : []),
        ...(selection.ids.some((id) => modifiers.some((node) => node.id === id))
          ? [{ label: 'group (⌘G)', onSelect: () => groupSelection() }]
          : []),
        ...(clusters.some(
          (cluster) =>
            selectedIds.has(cluster.id) || cluster.members.some((id) => selectedIds.has(id)),
        )
          ? [{ label: 'ungroup (⇧⌘G)', onSelect: () => ungroupSelection() }]
          : []),
        ...(subject
          ? [
              { label: `copy ${subject}`, onSelect: () => copyNodes() },
              { label: `duplicate ${subject}`, onSelect: () => duplicateNodes() },
              { label: `delete ${subject}`, onSelect: () => deleteNodes(selectionRef.current.ids) },
            ]
          : []),
      ]
    : []

  return (
    <NodeDragContext.Provider value={dragController}>
      <main className="canvas-page">
        <section
          ref={canvasRef}
          className="infinite-canvas"
          aria-label="Canvas"
          style={grid}
          data-linking={pending ? 'on' : undefined}
          onPointerMove={(e) => {
            pointer.current = toCanvas(e.clientX, e.clientY)
          }}
          onPointerLeave={() => {
            pointer.current = null
          }}
          onFocusCapture={(e) => {
            const target = e.target
            if (!(target instanceof HTMLTextAreaElement) || !target.classList.contains('rag-text'))
              return
            const sceneId = target.closest<HTMLElement>('[data-scene-node]')?.dataset.sceneId
            const source = links.findLast(
              (link) =>
                !link.muted &&
                link.to === sceneId &&
                modifiers.some((node) => node.id === link.from && node.kind === 'text'),
            )
            if (source) typing.stop(source.from)
          }}
          onContextMenu={(e) => {
            const target = e.target as Element
            if (target.closest(NATIVE_MENU) || target.closest('[data-scene-controls]')) return
            e.preventDefault()
            const rect = e.currentTarget.getBoundingClientRect()
            const repeatId = target.closest<HTMLElement>('[data-repeat-node]')?.dataset.sceneId
            const sceneId = target.closest<HTMLElement>('[data-scene-node]')?.dataset.sceneId
            const compositionId =
              target.closest<HTMLElement>('[data-composition-node]')?.dataset.sceneId
            const recordId = target.closest<HTMLElement>('[data-record-node]')?.dataset.sceneId
            const nodeElement = target.closest<HTMLElement>('[data-canvas-node]')
            const nodeId = nodeElement?.dataset.nodeId
            const nodeKind = nodeElement?.dataset.kind as ModifierKind | undefined
            const clusterId = target.closest<HTMLElement>('[data-cluster-id]')?.dataset.clusterId
            const menuTarget: MenuTarget = repeatId
              ? { kind: 'repeat', id: repeatId }
              : sceneId
              ? { kind: 'scene', id: sceneId }
              : !nodeElement && clusterId
                ? { kind: 'cluster', id: clusterId }
                : compositionId
                  ? { kind: 'composition', id: compositionId }
                  : recordId
                  ? { kind: 'record', id: recordId }
                  : nodeId && nodeKind && nodeId !== MASTER_ID
                    ? { kind: nodeKind, id: nodeId }
                    : null
            if (menuTarget) selectNode(menuTarget.id)
            else if (nodeId === MASTER_ID) selectNode(MASTER_ID)
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
            {/* First, so the scenes and compositions (same layer, later) cover the links. */}
            <svg className="node-links" aria-hidden="true">
              {linkPaths.map(({ key, from, to, muted }) => (
                <NodeLinkPath
                  key={key}
                  from={from}
                  to={to}
                  zoom={view.zoom}
                  muted={muted}
                  selected={selectedEdgeSet.has(key)}
                />
              ))}
              {pendingPath && <path d={pendingPath} data-pending />}
            </svg>
            {/* The edges' hit areas (wider than the lines; under the nodes, like the lines). */}
            <svg className="node-link-hits" data-no-pan aria-hidden="true">
              {linkPaths.map(({ key, from, to }) => (
                <NodeLinkHit
                  key={key}
                  edge={key}
                  from={from}
                  to={to}
                  zoom={view.zoom}
                  onSelect={selectEdge}
                />
              ))}
            </svg>
            {scenes.map((node) => (
              <CanvasScene
                key={node.id}
                node={node}
                selected={selectedIds.has(node.id)}
                getZoom={getZoom}
                renderZoom={renderZoom}
                modifiers={sceneModifiers.get(node.id) ?? NO_MODIFIERS}
                rangeModifiers={rangeModifiersByScene.get(node.id)}
                selectedRangeModifierIds={selectedIds}
                textNodeId={
                  links
                    .filter(
                      (link) =>
                        !link.muted &&
                        link.to === node.id &&
                        modifiers.some(
                          (modifier) => modifier.id === link.from && modifier.kind === 'text',
                        ),
                    )
                    .at(-1)?.from
                }
                selectedTextNodeIds={selectedIds}
                onRangeChange={setModifierParams}
                onRangeBoundary={checkpoint}
                onSelect={selectNode}
                onInputDown={pickUpLink}
                onOutputDown={startLink}
                onToggleMute={toggleOutgoingMute}
                muted={mutedNodes.has(node.id)}
                onMove={moveScene}
                onTextChange={setSceneText}
                onExporter={setExporter}
                onFrameSource={setFrameSource}
                onVisualChange={onVisualChange}
                onResize={resizeScene}
              />
            ))}
            {repeats.map((node) => (
              <RepeatArtboard
                key={node.id}
                node={node}
                selected={selectedIds.has(node.id)}
                getZoom={getZoom}
                renderZoom={renderZoom}
                modifiers={sceneModifiers.get(node.id) ?? NO_MODIFIERS}
                onSelect={selectNode}
                onInputDown={pickUpLink}
                onMove={moveRepeat}
                onResize={resizeRepeat}
                onLayoutChange={setRepeatLayout}
                onExporter={setExporter}
                onFrameSource={setFrameSource}
                onOutputDown={startLink}
              />
            ))}
            {fittedCompositions.map((node) => {
              const link = links.findLast((item) => item.to === node.id && !item.muted)
              return (
                <CanvasComposition
                  key={node.id}
                  node={node}
                  selected={selectedIds.has(node.id)}
                  getZoom={getZoom}
                  imageUrl={link ? sceneImages.get(link.from) : undefined}
                  connected={Boolean(link)}
                  onSelect={selectNode}
                  onMove={moveComposition}
                  onInputDown={pickUpLink}
                  onResize={resizeComposition}
                  onImageChange={setCompositionImage}
                />
              )
            })}
            {placedRecords.map((node) => {
              const input = recordInputs.get(node.id)
              return (
                <CanvasRecord
                  key={node.id}
                  node={node}
                  selected={selectedIds.has(node.id)}
                  getZoom={getZoom}
                  inputId={input?.id ?? null}
                  inputScale={input?.imageExport.scale ?? 1}
                  typing={recordTypings.get(node.id) ?? null}
                  getFrameSource={getFrameSource}
                  seekTyping={seekTyping}
                  onSelect={selectNode}
                  onMove={moveRecord}
                  onInputDown={pickUpLink}
                  onChange={updateRecord}
                  onTextChange={setModifierParams}
                />
              )
            })}
            {clusterLayouts.map(({ cluster, bounds }) => (
              <ClusterFrame
                key={cluster.id}
                cluster={cluster}
                bounds={bounds}
                scale={cardOnCanvas}
                selected={selectedIds.has(cluster.id)}
                connected={links.some((link) => link.from === cluster.id)}
                getZoom={getZoom}
                onSelect={selectNode}
                onMove={moveModifier}
                onOutputDown={startLink}
                muted={mutedNodes.has(cluster.id)}
                onToggleMute={toggleOutgoingMute}
              />
            ))}
            <NodeCard
              node={master}
              selected={selectedIds.has(MASTER_ID)}
              getZoom={getZoom}
              connected={false}
              compact={compactCards}
              onCollapsedChange={setModifierCollapsed}
              onSelect={selectNode}
              onMove={moveModifier}
              onParamsChange={setModifierParams}
              onOutputDown={startLink}
            />
            {modifiers.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                selected={selectedIds.has(node.id)}
                getZoom={getZoom}
                connected={linkedNodes.has(node.id)}
                grouped={groupedNodes.has(node.id)}
                muted={mutedNodes.has(node.id)}
                onToggleMute={toggleOutgoingMute}
                pattern={patternStatuses.get(node.id)}
                typingPlaying={Boolean(typing.playing[node.id])}
                onTypingToggle={typing.toggle}
                compact={compactCards}
                onCollapsedChange={setModifierCollapsed}
                onSelect={selectNode}
                onMove={moveModifier}
                onParamsChange={setModifierParams}
                onOutputDown={startLink}
              />
            ))}
          </div>
          <SelectionMarquee canvasRef={canvasRef} onSelect={addSelected} onClear={clearSelected} />
          {scenes.length === 0 &&
            compositions.length === 0 &&
            records.length === 0 &&
            repeats.length === 0 &&
            modifiers.length === 0 && (
            <p className="canvas-hint">Right-click to insert a scene</p>
          )}
          {selectedScene && (
            <PositionedSceneControls node={selectedScene} view={view} size={size}>
              <SceneControls
                key={selectedScene.id}
                node={selectedScene}
                litByNode={sceneModifiers.get(selectedScene.id)?.lighting !== undefined}
                onChange={updateScene}
                exporter={getExporter}
              />
            </PositionedSceneControls>
          )}
          {selectedRepeat && (
            <PositionedSceneControls node={selectedRepeat} view={view} size={size}>
              <RepeatControls
                key={selectedRepeat.id}
                node={selectedRepeat}
                onUpdate={updateRepeat}
                exporter={getExporter}
              />
            </PositionedSceneControls>
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
    </NodeDragContext.Provider>
  )
}

/** What a link can come from: a modifier node, a scene (to compositions and record nodes), a
 *  repeat (to record nodes), or a cluster (its
 *  frame, canvas px). */
type LinkSource =
  | ModifierNode
  | SceneNode
  | RepeatNode
  | ({ id: string; cluster: true } & Rect)

function sourcePort(node: LinkSource, zoom: number) {
  if ('cluster' in node) return clusterPort(node, cardScale(zoom) / zoom)
  return 'frame' in node
    ? { x: node.x + node.frame.width, y: node.y + node.frame.height * 0.25 }
    : outputPort(node, zoom)
}

/** What a link can go to: a scene or repeat (from modifiers), a composition or record node
 *  (from a scene). */
type LinkTarget = SceneNode | CompositionNode | RepeatNode | PlacedRecordNode

/** A link's identity, for React keys and edge selection (one link per pair). */
function linkKey(link: Pick<NodeLink, 'from' | 'to'>) {
  return `${link.from}→${link.to}`
}

/** An edge's curve, following its endpoints' drag previews (it subscribes only to those,
 *  not the entire canvas document). */
function useLinkCurve(
  from: LinkSource,
  to: LinkTarget,
  zoom: number,
) {
  const source = useNodePosition(from.id, from)
  const destination = useNodePosition(to.id, to)
  return linkPath(
    sourcePort({ ...from, ...source }, zoom),
    inputPort({ ...to, ...destination }),
    zoom,
  )
}

type LinkCurveProps = {
  from: LinkSource
  to: LinkTarget
  zoom: number
}

const NodeLinkPath = memo(function NodeLinkPath({
  from,
  to,
  zoom,
  muted,
  selected,
}: LinkCurveProps & { muted?: boolean; selected?: boolean }) {
  return (
    <path
      data-muted={muted || undefined}
      data-selected={selected || undefined}
      d={useLinkCurve(from, to, zoom)}
    />
  )
})

/** An edge's invisible, wider hit area: a press selects the edge (Shift toggles it). */
const NodeLinkHit = memo(function NodeLinkHit({
  edge,
  from,
  to,
  zoom,
  onSelect,
}: LinkCurveProps & { edge: string; onSelect: (edge: string, additive: boolean) => void }) {
  return (
    <path
      data-edge={edge}
      d={useLinkCurve(from, to, zoom)}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const active = document.activeElement
        if (active instanceof HTMLElement) active.blur()
        onSelect(edge, e.shiftKey)
      }}
    />
  )
})

function PositionedSceneControls({
  node,
  view,
  size,
  children,
}: {
  node: Pick<SceneNode, 'id' | 'x' | 'y' | 'frame'>
  view: { x: number; y: number; zoom: number }
  size: { width: number; height: number }
  children: ReactNode
}) {
  const position = useNodePosition(node.id, node)
  const { width, gap, inset, minHeight } = CONTROLS
  const left = clamp(
    view.x + (position.x + node.frame.width) * view.zoom + gap,
    inset,
    Math.max(inset, size.width - width - inset),
  )
  const top = clamp(
    view.y + position.y * view.zoom,
    inset,
    Math.max(inset, size.height - minHeight - inset),
  )
  return (
    <div
      className="scene-controls"
      data-scene-controls
      data-no-pan
      data-own-wheel
      style={{ left, top, width, maxHeight: Math.max(0, size.height - top - inset) }}
    >
      {children}
    </div>
  )
}

interface SceneControlsProps {
  node: SceneNode
  /** A lighting node is linked: its lighting is used, so the panel leaves its own out. */
  litByNode: boolean
  onChange: (id: string, update: (node: SceneNode) => SceneNode) => void
  /** The scene's image exporter, if it's mounted. */
  exporter: (id: string) => SceneExporter | undefined
}

/** The selected scene's control panel. Memoized: the page re-renders on every pan frame
 *  (only the panel's position changes), and the panel is the page's largest part. */
const SceneControls = memo(function SceneControls({
  node,
  litByNode,
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
      hidden={litByNode ? MASTER_AND_LIGHTING_FIELDS : MASTER_FIELDS}
      hideShapeMaterial
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
